import { eq, inArray } from 'drizzle-orm';
import { steamImage } from '$lib/games';
import { DAY } from '../cache';
import { getDb } from '../db/client';
import { achievements, games, type GameRow } from '../db/schema';
import { getIgdbGame, type IgdbGame } from '../providers/igdb';
import { getGlobalPercentages, getSchema, getStoreDetails } from '../providers/steam';

/** Games are shared by everyone on the server; this file creates and refreshes them. */

export function getGame(id: number): GameRow | undefined {
	return getDb().select().from(games).where(eq(games.id, id)).get();
}

export function findSteamGame(appId: number): GameRow | undefined {
	return getDb().select().from(games).where(eq(games.steamAppId, appId)).get();
}

/**
 * Makes sure every Steam app has a game row, in one transaction. Returns app id → game id.
 * Names are updated when Steam renames a game.
 */
export function ensureSteamGames(apps: { appId: number; name: string }[]): Map<number, number> {
	const db = getDb();
	const ids = new Map<number, number>();
	if (apps.length === 0) return ids;
	db.transaction((tx) => {
		const existing = new Map<number, GameRow>();
		// Chunked: SQLite limits the number of bound parameters.
		for (let i = 0; i < apps.length; i += 500) {
			const chunk = apps.slice(i, i + 500).map((a) => a.appId);
			for (const row of tx.select().from(games).where(inArray(games.steamAppId, chunk)).all()) {
				existing.set(row.steamAppId!, row);
			}
		}
		for (const app of apps) {
			const row = existing.get(app.appId);
			if (row) {
				if (row.name !== app.name && !app.name.startsWith('App ')) {
					tx.update(games).set({ name: app.name }).where(eq(games.id, row.id)).run();
				}
				ids.set(app.appId, row.id);
				continue;
			}
			const { id } = tx
				.insert(games)
				.values({
					steamAppId: app.appId,
					name: app.name,
					cover: steamImage.cover(app.appId),
					hero: steamImage.hero(app.appId)
				})
				.returning({ id: games.id })
				.get();
			ids.set(app.appId, id);
		}
	});
	return ids;
}

export function ensureSteamGame(appId: number, name: string): number {
	return ensureSteamGames([{ appId, name }]).get(appId)!;
}

/**
 * Stores an IGDB game. When IGDB knows its Steam app, the Steam game is used (one row per real
 * game), filled in with IGDB's details.
 */
export function ensureIgdbGame(game: IgdbGame): number {
	const db = getDb();
	const details = {
		igdbId: game.igdbId,
		summary: game.summary,
		releaseDate: game.releaseDate,
		developers: game.developers,
		genres: game.genres,
		platforms: game.platforms,
		detailsUpdatedAt: new Date()
	};
	const byIgdb = db.select().from(games).where(eq(games.igdbId, game.igdbId)).get();
	if (byIgdb) {
		db.update(games).set(details).where(eq(games.id, byIgdb.id)).run();
		return byIgdb.id;
	}
	if (game.steamAppId) {
		const steam = findSteamGame(game.steamAppId);
		if (steam) {
			db.update(games)
				.set({ ...details, summary: steam.summary ?? game.summary })
				.where(eq(games.id, steam.id))
				.run();
			return steam.id;
		}
	}
	const { id } = db
		.insert(games)
		.values({
			...details,
			steamAppId: game.steamAppId,
			name: game.name,
			cover: game.cover ?? (game.steamAppId ? steamImage.cover(game.steamAppId) : null),
			hero: game.hero ?? (game.steamAppId ? steamImage.hero(game.steamAppId) : null)
		})
		.returning({ id: games.id })
		.get();
	return id;
}

/** A game added by hand, with only a name. */
export function createManualGame(name: string, platform?: string): number {
	const { id } = getDb()
		.insert(games)
		.values({ name: name.trim(), platforms: platform ? [platform] : [] })
		.returning({ id: games.id })
		.get();
	return id;
}

/** Store or IGDB details (summary, release date, developers), refreshed every 30 days. */
export async function refreshDetails(game: GameRow, { force = false } = {}): Promise<void> {
	const fresh = game.detailsUpdatedAt && Date.now() - game.detailsUpdatedAt.getTime() < 30 * DAY;
	if (fresh && !force) return;
	const db = getDb();
	if (game.steamAppId) {
		const store = await getStoreDetails(game.steamAppId);
		db.update(games)
			.set({
				name: store?.name ?? game.name,
				summary: store?.summary ?? game.summary,
				releaseDate: store?.releaseDate ?? game.releaseDate,
				developers: store?.developers.length ? store.developers : game.developers,
				genres: store?.genres.length ? store.genres : game.genres,
				detailsUpdatedAt: new Date()
			})
			.where(eq(games.id, game.id))
			.run();
		return;
	}
	if (game.igdbId) {
		const igdb = await getIgdbGame(game.igdbId);
		if (igdb) ensureIgdbGame(igdb);
	}
}

const SCHEMA_TTL = 7 * DAY;

export const schemaIsStale = (game: Pick<GameRow, 'schemaUpdatedAt'>, now = Date.now()) =>
	!game.schemaUpdatedAt || now - game.schemaUpdatedAt.getTime() > SCHEMA_TTL;

/**
 * Reads a Steam game's achievement list and rarity. Achievements Steam no longer lists are
 * removed; custom checklist items are kept.
 */
export async function syncSchema(gameId: number, appId: number): Promise<number> {
	const [schema, percentages] = await Promise.all([getSchema(appId), getGlobalPercentages(appId)]);
	const db = getDb();
	db.transaction((tx) => {
		const current = tx
			.select({ id: achievements.id, key: achievements.key, source: achievements.source })
			.from(achievements)
			.where(eq(achievements.gameId, gameId))
			.all();
		const listed = new Set(schema.map((a) => a.apiName));
		const gone = current.filter((a) => a.source === 'steam' && !listed.has(a.key)).map((a) => a.id);
		if (gone.length) tx.delete(achievements).where(inArray(achievements.id, gone)).run();
		for (const a of schema) {
			const values = {
				name: a.name,
				description: a.description,
				icon: a.icon,
				iconLocked: a.iconLocked,
				hidden: a.hidden,
				globalPercent: percentages.get(a.apiName) ?? null,
				sortOrder: a.order
			};
			tx.insert(achievements)
				.values({ gameId, key: a.apiName, source: 'steam', ...values })
				.onConflictDoUpdate({ target: [achievements.gameId, achievements.key], set: values })
				.run();
		}
		tx.update(games).set({ schemaUpdatedAt: new Date() }).where(eq(games.id, gameId)).run();
	});
	return schema.length;
}
