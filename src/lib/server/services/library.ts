import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { isPerfect, type GameStatus, type Progress } from '$lib/games';
import { getDb } from '../db/client';
import {
	achievements,
	games,
	libraryEntries,
	userAchievements,
	type GameRow,
	type LibraryEntryRow
} from '../db/schema';

export interface LibraryItem {
	entry: LibraryEntryRow;
	game: Pick<GameRow, 'id' | 'name' | 'cover' | 'hero' | 'steamAppId' | 'releaseDate'>;
	progress: Progress;
}

/**
 * Unlocked and total achievements per game for one person, in one grouped query. Custom
 * checklist items count like achievements.
 */
export function progressByGame(userId: number, gameIds?: number[]): Map<number, Progress> {
	if (gameIds && gameIds.length === 0) return new Map();
	const db = getDb();
	const scope = gameIds
		? inArray(achievements.gameId, gameIds)
		: inArray(
				achievements.gameId,
				db
					.select({ id: libraryEntries.gameId })
					.from(libraryEntries)
					.where(eq(libraryEntries.userId, userId))
			);
	const rows = db
		.select({
			gameId: achievements.gameId,
			total: count(),
			unlocked: count(userAchievements.achievementId)
		})
		.from(achievements)
		.leftJoin(
			userAchievements,
			and(eq(userAchievements.achievementId, achievements.id), eq(userAchievements.userId, userId))
		)
		.where(scope)
		.groupBy(achievements.gameId)
		.all();
	return new Map(rows.map((r) => [r.gameId, { unlocked: r.unlocked, total: r.total }]));
}

export function progressFor(userId: number, gameId: number): Progress {
	return progressByGame(userId, [gameId]).get(gameId) ?? { unlocked: 0, total: 0 };
}

export function listLibrary(userId: number, statuses?: GameStatus[]): LibraryItem[] {
	const db = getDb();
	const rows = db
		.select({
			entry: libraryEntries,
			game: {
				id: games.id,
				name: games.name,
				cover: games.cover,
				hero: games.hero,
				steamAppId: games.steamAppId,
				releaseDate: games.releaseDate
			}
		})
		.from(libraryEntries)
		.innerJoin(games, eq(games.id, libraryEntries.gameId))
		.where(
			and(
				eq(libraryEntries.userId, userId),
				statuses?.length ? inArray(libraryEntries.status, statuses) : undefined
			)
		)
		.orderBy(sql`${games.name} collate nocase`)
		.all();
	const progress = progressByGame(userId);
	return rows.map((r) => ({
		...r,
		progress: progress.get(r.game.id) ?? { unlocked: 0, total: 0 }
	}));
}

export function statusCounts(userId: number): Record<GameStatus, number> & { all: number } {
	const rows = getDb()
		.select({ status: libraryEntries.status, n: count() })
		.from(libraryEntries)
		.where(eq(libraryEntries.userId, userId))
		.groupBy(libraryEntries.status)
		.all();
	const counts = {
		all: 0,
		playing: 0,
		backlog: 0,
		unsorted: 0,
		beaten: 0,
		on_hold: 0,
		abandoned: 0,
		wishlist: 0
	};
	for (const row of rows) {
		counts[row.status] = row.n;
		counts.all += row.n;
	}
	return counts;
}

export function getEntry(userId: number, gameId: number): LibraryEntryRow | undefined {
	return getDb()
		.select()
		.from(libraryEntries)
		.where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.gameId, gameId)))
		.get();
}

export function addToLibrary(
	userId: number,
	gameId: number,
	values: { status: GameStatus; platform?: string | null }
): LibraryEntryRow {
	const db = getDb();
	db.insert(libraryEntries)
		.values({ userId, gameId, status: values.status, platform: values.platform ?? null })
		.onConflictDoUpdate({
			target: [libraryEntries.userId, libraryEntries.gameId],
			set: {
				status: values.status,
				...(values.platform !== undefined ? { platform: values.platform } : {}),
				updatedAt: new Date()
			}
		})
		.run();
	return getEntry(userId, gameId)!;
}

export function updateEntry(
	userId: number,
	gameId: number,
	values: Partial<Pick<LibraryEntryRow, 'status' | 'platform' | 'rating' | 'notes'>>
): void {
	getDb()
		.update(libraryEntries)
		.set({ ...values, updatedAt: new Date() })
		.where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.gameId, gameId)))
		.run();
}

export function removeFromLibrary(userId: number, gameId: number): void {
	const db = getDb();
	db.transaction((tx) => {
		tx.delete(libraryEntries)
			.where(and(eq(libraryEntries.userId, userId), eq(libraryEntries.gameId, gameId)))
			.run();
		// Unlocks ticked by hand go with it; Steam's come back on the next sync if still owned.
		const ids = tx
			.select({ id: achievements.id })
			.from(achievements)
			.where(eq(achievements.gameId, gameId));
		tx.delete(userAchievements)
			.where(and(eq(userAchievements.userId, userId), inArray(userAchievements.achievementId, ids)))
			.run();
	});
}

/**
 * Records (or clears) the moment a game reached 100%. A game that's perfected while sitting in
 * Playing, Backlog or Unsorted moves to Beaten. Returns true when it just became perfect.
 */
export function updatePerfection(userId: number, gameId: number, at = new Date()): boolean {
	const entry = getEntry(userId, gameId);
	if (!entry) return false;
	const perfect = isPerfect(progressFor(userId, gameId));
	if (perfect && !entry.perfectedAt) {
		const moveToBeaten = ['playing', 'backlog', 'unsorted'].includes(entry.status);
		getDb()
			.update(libraryEntries)
			.set({ perfectedAt: at, ...(moveToBeaten ? { status: 'beaten' as const } : {}) })
			.where(eq(libraryEntries.id, entry.id))
			.run();
		return true;
	}
	if (!perfect && entry.perfectedAt) {
		getDb()
			.update(libraryEntries)
			.set({ perfectedAt: null })
			.where(eq(libraryEntries.id, entry.id))
			.run();
	}
	return false;
}

/** After a game's list changed (checklist item added or removed): re-check everyone who has it. */
export function recheckPerfection(gameId: number): void {
	const userIds = getDb()
		.select({ userId: libraryEntries.userId })
		.from(libraryEntries)
		.where(eq(libraryEntries.gameId, gameId))
		.all();
	for (const { userId } of userIds) updatePerfection(userId, gameId);
}

/** Perfected games, most recent first: the Hall of Fame. */
export function perfectedGames(userId: number) {
	return getDb()
		.select({ entry: libraryEntries, game: games })
		.from(libraryEntries)
		.innerJoin(games, eq(games.id, libraryEntries.gameId))
		.where(and(eq(libraryEntries.userId, userId), sql`${libraryEntries.perfectedAt} is not null`))
		.orderBy(desc(libraryEntries.perfectedAt))
		.all();
}
