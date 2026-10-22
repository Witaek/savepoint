import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { GameStatus } from '$lib/games';
import { DAY, cached } from '../cache';
import { getDb } from '../db/client';
import {
	achievements,
	libraryEntries,
	userAchievements,
	users,
	type LibraryEntryRow,
	type SteamSyncState
} from '../db/schema';
import {
	SteamPrivateError,
	getOwnedGames,
	getPlayerAchievements,
	getProfile,
	getRecentlyPlayed,
	getStoreDetails,
	getWishlist,
	parseSteamProfile,
	resolveVanity,
	type OwnedGame
} from '../providers/steam';
import { ensureSteamGame, ensureSteamGames, getGame, schemaIsStale, syncSchema } from './games';
import { progressFor, updatePerfection } from './library';
import { notifyUser, unlockMessage, type UnlockBatch } from './notifications';

/**
 * Keeps each person's library and achievements in step with their Steam account.
 *
 * - Linking an account imports every owned game and reads achievements for all of them (a few
 *   minutes for a large library, in the background).
 * - Every 15 minutes, recently played games whose playtime changed get their achievements read.
 * - Every night, the owned-games list is read again (new purchases, playtime) along with any
 *   game whose achievements weren't read in a month (rarity and new DLC achievements).
 */

const RECENT = 14 * DAY;
const RECHECK_AFTER = 30 * DAY;
const syncing = new Set<number>();

export const isSyncing = (userId: number) => syncing.has(userId);

function setState(userId: number, state: SteamSyncState, extra: { syncedAt?: Date } = {}) {
	getDb()
		.update(users)
		.set({ steamSync: state, ...(extra.syncedAt ? { steamSyncedAt: extra.syncedAt } : {}) })
		.where(eq(users.id, userId))
		.run();
}

// ---------- Linking ----------

export async function linkSteam(userId: number, input: string): Promise<{ error: string } | null> {
	const parsed = parseSteamProfile(input);
	if (!parsed) {
		return {
			error: 'Paste your profile link (steamcommunity.com/id/… or /profiles/…) or your SteamID64.'
		};
	}
	const steamId = 'steamId' in parsed ? parsed.steamId : await resolveVanity(parsed.vanity);
	if (!steamId)
		return { error: `No Steam profile is called "${'vanity' in parsed ? parsed.vanity : input}".` };
	const profile = await getProfile(steamId);
	if (!profile) return { error: 'Steam found no profile with that id.' };
	if (!profile.isPublic) {
		return { error: new SteamPrivateError('profile').message };
	}
	getDb()
		.update(users)
		.set({
			steamId,
			steamName: profile.name,
			steamAvatar: profile.avatar,
			steamSyncedAt: null,
			steamSync: { status: 'running', message: 'Starting…' }
		})
		.where(eq(users.id, userId))
		.run();
	void fullSync(userId);
	return null;
}

export function unlinkSteam(userId: number): void {
	const db = getDb();
	db.transaction((tx) => {
		tx.update(users)
			.set({
				steamId: null,
				steamName: null,
				steamAvatar: null,
				steamSyncedAt: null,
				steamSync: { status: 'idle' }
			})
			.where(eq(users.id, userId))
			.run();
		// Games stay in the library; their achievements can now be ticked by hand.
		tx.update(libraryEntries)
			.set({ steamOwned: false })
			.where(eq(libraryEntries.userId, userId))
			.run();
	});
}

// ---------- Library ----------

/** Status for a game seen on Steam for the first time. */
export function initialStatus(game: OwnedGame, now = Date.now()): GameStatus {
	if (game.lastPlayedAt && now - game.lastPlayedAt.getTime() < RECENT) return 'playing';
	if (game.playtimeMinutes === 0) return 'backlog';
	return 'unsorted';
}

/** Playing a game that was waiting moves it to Playing. */
const WAKES_UP: GameStatus[] = ['backlog', 'unsorted', 'on_hold', 'wishlist'];

function entriesByGame(userId: number, gameIds: number[]): Map<number, LibraryEntryRow> {
	const map = new Map<number, LibraryEntryRow>();
	for (let i = 0; i < gameIds.length; i += 500) {
		const rows = getDb()
			.select()
			.from(libraryEntries)
			.where(
				and(
					eq(libraryEntries.userId, userId),
					inArray(libraryEntries.gameId, gameIds.slice(i, i + 500))
				)
			)
			.all();
		for (const row of rows) map.set(row.gameId, row);
	}
	return map;
}

/**
 * Applies Steam's view of some owned games to the library: adds new ones, updates playtime and
 * last played. Returns game id per app id.
 */
export function applyOwnedGames(userId: number, owned: OwnedGame[], now = Date.now()) {
	const ids = ensureSteamGames(owned);
	const existing = entriesByGame(userId, [...ids.values()]);
	getDb().transaction((tx) => {
		for (const game of owned) {
			const gameId = ids.get(game.appId)!;
			const entry = existing.get(gameId);
			if (!entry) {
				tx.insert(libraryEntries)
					.values({
						userId,
						gameId,
						status: initialStatus(game, now),
						platform: 'Steam',
						steamOwned: true,
						playtimeMinutes: game.playtimeMinutes,
						lastPlayedAt: game.lastPlayedAt
					})
					.run();
				continue;
			}
			const played = game.playtimeMinutes > entry.playtimeMinutes;
			const changed =
				played ||
				!entry.steamOwned ||
				(game.lastPlayedAt !== null &&
					entry.lastPlayedAt?.getTime() !== game.lastPlayedAt.getTime()) ||
				entry.status === 'wishlist';
			if (!changed) continue;
			tx.update(libraryEntries)
				.set({
					steamOwned: true,
					platform: entry.platform ?? 'Steam',
					playtimeMinutes: Math.max(game.playtimeMinutes, entry.playtimeMinutes),
					// The recently-played list has no date: playtime going up means "just now".
					lastPlayedAt: game.lastPlayedAt ?? (played ? new Date(now) : entry.lastPlayedAt),
					// Bought from the wishlist, or picked up again.
					status:
						entry.status === 'wishlist'
							? initialStatus(game, now)
							: played && WAKES_UP.includes(entry.status)
								? 'playing'
								: entry.status,
					updatedAt: new Date()
				})
				.where(eq(libraryEntries.id, entry.id))
				.run();
		}
	});
	return ids;
}

/** Adds the public Steam wishlist. Best effort: the endpoint is undocumented. */
async function importWishlist(userId: number, steamId: string): Promise<number> {
	let items;
	try {
		items = await getWishlist(steamId);
	} catch (error) {
		console.warn(`[steam] wishlist not imported: ${String(error)}`);
		return 0;
	}
	let added = 0;
	for (const item of items) {
		const name = await cached(`steam:name:${item.appId}`, 30 * DAY, async () => {
			const details = await getStoreDetails(item.appId).catch(() => null);
			return details?.name ?? null;
		});
		const gameId = ensureSteamGame(item.appId, name ?? `App ${item.appId}`);
		const inserted = getDb()
			.insert(libraryEntries)
			.values({ userId, gameId, status: 'wishlist', platform: 'Steam' })
			.onConflictDoNothing()
			.run();
		added += inserted.changes;
	}
	return added;
}

// ---------- Achievements ----------

export interface GameSyncResult {
	newUnlocks: string[];
	perfect: boolean;
}

/**
 * Reads one game's achievements from Steam and mirrors them: new unlocks are added, achievements
 * Steam now shows as locked (a reset) are removed. Unlocks ticked by hand are replaced by
 * Steam's. Returns null for a game without achievements.
 */
export async function syncGameAchievements(
	userId: number,
	steamId: string,
	gameId: number
): Promise<GameSyncResult | null> {
	const game = getGame(gameId);
	if (!game?.steamAppId) return null;
	const db = getDb();
	const player = await getPlayerAchievements(steamId, game.steamAppId);
	const markSynced = () =>
		db
			.update(libraryEntries)
			.set({
				achievementsSyncedAt: new Date(),
				syncedPlaytime: sql`${libraryEntries.playtimeMinutes}`
			})
			.where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.gameId, gameId)))
			.run();
	if (!player || player.length === 0) {
		markSynced();
		return null;
	}

	const keys = () =>
		new Map(
			db
				.select({ id: achievements.id, key: achievements.key })
				.from(achievements)
				.where(and(eq(achievements.gameId, gameId), eq(achievements.source, 'steam')))
				.all()
				.map((a) => [a.key, a.id] as const)
		);
	let byKey = keys();
	if (schemaIsStale(game) || player.some((a) => !byKey.has(a.apiName))) {
		await syncSchema(gameId, game.steamAppId);
		byKey = keys();
	}

	const newUnlocks: string[] = [];
	let latest = 0;
	db.transaction((tx) => {
		const mine = new Map(
			tx
				.select({ id: userAchievements.achievementId, source: userAchievements.source })
				.from(userAchievements)
				.where(
					and(
						eq(userAchievements.userId, userId),
						inArray(userAchievements.achievementId, [...byKey.values()])
					)
				)
				.all()
				.map((r) => [r.id, r.source] as const)
		);
		for (const a of player) {
			const id = byKey.get(a.apiName);
			if (id === undefined) continue;
			const had = mine.get(id);
			if (a.unlockedAt) {
				latest = Math.max(latest, a.unlockedAt.getTime());
				if (had === 'steam') continue;
				tx.insert(userAchievements)
					.values({ userId, achievementId: id, unlockedAt: a.unlockedAt, source: 'steam' })
					.onConflictDoUpdate({
						target: [userAchievements.userId, userAchievements.achievementId],
						set: { unlockedAt: a.unlockedAt, source: 'steam' }
					})
					.run();
				if (!had) newUnlocks.push(id.toString());
			} else if (had === 'steam') {
				tx.delete(userAchievements)
					.where(and(eq(userAchievements.userId, userId), eq(userAchievements.achievementId, id)))
					.run();
			}
		}
		tx.update(libraryEntries)
			// syncedPlaytime remembers the playtime these achievements belong to.
			.set({
				achievementsSyncedAt: new Date(),
				syncedPlaytime: sql`${libraryEntries.playtimeMinutes}`
			})
			.where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.gameId, gameId)))
			.run();
	});

	const names = newUnlocks.length
		? db
				.select({ name: achievements.name })
				.from(achievements)
				.where(inArray(achievements.id, newUnlocks.map(Number)))
				.all()
				.map((a) => a.name)
		: [];
	const perfect = updatePerfection(userId, gameId, latest ? new Date(latest) : new Date());
	return { newUnlocks: names, perfect };
}

/** Runs tasks with at most `limit` in flight. */
async function pool<T>(items: T[], limit: number, task: (item: T, index: number) => Promise<void>) {
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const index = next++;
			await task(items[index], index);
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

async function syncGames(
	userId: number,
	steamId: string,
	gameIds: number[],
	{ notify, progress }: { notify: boolean; progress?: (done: number, total: number) => void }
): Promise<{ games: number; unlocks: number }> {
	const batches: UnlockBatch[] = [];
	let done = 0;
	let unlocks = 0;
	let privateError: SteamPrivateError | null = null;
	await pool(gameIds, 4, async (gameId) => {
		if (privateError) return;
		try {
			const result = await syncGameAchievements(userId, steamId, gameId);
			if (result && (result.newUnlocks.length || result.perfect)) {
				unlocks += result.newUnlocks.length;
				const { unlocked, total } = progressFor(userId, gameId);
				batches.push({
					gameId,
					gameName: getGame(gameId)!.name,
					names: result.newUnlocks,
					unlocked,
					total,
					perfect: result.perfect
				});
			}
		} catch (error) {
			if (error instanceof SteamPrivateError) privateError = error;
			else console.warn(`[steam] achievements of game ${gameId} not read: ${String(error)}`);
		}
		done++;
		if (done % 5 === 0 || done === gameIds.length) progress?.(done, gameIds.length);
	});
	if (privateError) throw privateError;
	if (notify) {
		for (const batch of batches) await notifyUser(userId, unlockMessage(batch));
	}
	return { games: gameIds.length, unlocks };
}

function linkedUser(userId: number) {
	const user = getDb().select().from(users).where(eq(users.id, userId)).get();
	return user?.steamId ? { ...user, steamId: user.steamId } : null;
}

/** Games owned on Steam whose achievements are due: never read, played since, or a month old. */
function dueGames(userId: number, all: boolean, now = Date.now()): number[] {
	const rows = getDb()
		.select({
			gameId: libraryEntries.gameId,
			playtime: libraryEntries.playtimeMinutes,
			syncedPlaytime: libraryEntries.syncedPlaytime,
			syncedAt: libraryEntries.achievementsSyncedAt
		})
		.from(libraryEntries)
		.where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.steamOwned, true)))
		.all();
	return rows
		.filter(
			(r) =>
				all ||
				!r.syncedAt ||
				r.playtime !== r.syncedPlaytime ||
				now - r.syncedAt.getTime() > RECHECK_AFTER
		)
		.map((r) => r.gameId);
}

/**
 * Reads the whole library, then achievements. `all` re-reads every game's achievements (first
 * sync, "Sync everything"); otherwise only the games that are due.
 */
export async function fullSync(userId: number, { all = false } = {}): Promise<string> {
	const user = linkedUser(userId);
	if (!user || syncing.has(userId)) return 'skipped';
	syncing.add(userId);
	// The first sync imports everything: no notification for each of hundreds of unlocks.
	const notify = user.steamSyncedAt !== null;
	const firstSync = user.steamSyncedAt === null;
	try {
		setState(userId, { status: 'running', message: 'Reading your Steam library…' });
		const owned = await getOwnedGames(user.steamId);
		applyOwnedGames(userId, owned);
		const wishlisted = await importWishlist(userId, user.steamId);

		const due = dueGames(userId, all || firstSync);
		setState(userId, {
			status: 'running',
			message: 'Reading achievements…',
			done: 0,
			total: due.length
		});
		const result = await syncGames(userId, user.steamId, due, {
			notify,
			progress: (done, total) =>
				setState(userId, { status: 'running', message: 'Reading achievements…', done, total })
		});
		const message = `${owned.length} games, ${result.unlocks} ${firstSync ? 'achievements imported' : 'new unlocks'}${wishlisted ? `, ${wishlisted} added to the wishlist` : ''}`;
		setState(userId, { status: 'idle', message }, { syncedAt: new Date() });
		return message;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		setState(userId, { status: 'error', message });
		throw error;
	} finally {
		syncing.delete(userId);
	}
}

/** The 15-minute pass: recently played games only (1 call, plus 1–3 per game played). */
export async function quickSync(userId: number): Promise<string> {
	const user = linkedUser(userId);
	if (!user || syncing.has(userId) || !user.steamSyncedAt) return 'skipped';
	syncing.add(userId);
	try {
		const recent = await getRecentlyPlayed(user.steamId);
		if (recent.length === 0) return 'nothing played recently';
		applyOwnedGames(userId, recent);
		const recentApps = new Set(recent.map((g) => g.appId));
		const due = dueGames(userId, false).filter((id) => recentApps.has(getGame(id)!.steamAppId!));
		const result = await syncGames(userId, user.steamId, due, { notify: true });
		getDb().update(users).set({ steamSyncedAt: new Date() }).where(eq(users.id, userId)).run();
		return `${result.games} games read, ${result.unlocks} new unlocks`;
	} finally {
		syncing.delete(userId);
	}
}

function linkedUserIds(): number[] {
	return getDb()
		.select({ id: users.id })
		.from(users)
		.where(and(isNotNull(users.steamId), eq(users.disabled, false)))
		.all()
		.map((u) => u.id);
}

export async function syncEveryone(kind: 'quick' | 'full'): Promise<string> {
	const ids = linkedUserIds();
	if (ids.length === 0) return 'no Steam accounts linked';
	const results: string[] = [];
	for (const id of ids) {
		try {
			results.push(await (kind === 'quick' ? quickSync(id) : fullSync(id)));
		} catch (error) {
			results.push(`error: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return results.join('; ');
}
