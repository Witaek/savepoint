import {
	index,
	integer,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex
} from 'drizzle-orm/sqlite-core';
import type { GameStatus } from '$lib/games';

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });

/** Key/value store for instance-level facts (IGDB token, …). */
export const appMeta = sqliteTable('app_meta', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
	updatedAt: timestamp('updated_at')
		.notNull()
		.$defaultFn(() => new Date())
});

/** Short-lived cache of provider responses (search, store details). */
export const apiCache = sqliteTable(
	'api_cache',
	{
		key: text('key').primaryKey(),
		value: text('value').notNull(),
		expiresAt: timestamp('expires_at').notNull()
	},
	(t) => [index('api_cache_expires_idx').on(t.expiresAt)]
);

export const jobRuns = sqliteTable(
	'job_runs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		job: text('job').notNull(),
		status: text('status', { enum: ['running', 'success', 'error'] }).notNull(),
		message: text('message'),
		startedAt: timestamp('started_at').notNull(),
		finishedAt: timestamp('finished_at')
	},
	(t) => [index('job_runs_job_idx').on(t.job, t.startedAt)]
);

// ---------- Accounts ----------

export interface UserPrefs {
	/** Show the full-screen message when a game reaches 100% (default on). */
	celebrate?: boolean;
	/** Perfected games already celebrated (game ids), so the message shows once. */
	celebrated?: number[];
	/** Show hidden achievements without blurring them. */
	showHidden?: boolean;
}

export interface SteamSyncState {
	status: 'idle' | 'running' | 'error';
	/** What is happening, or what went wrong. */
	message?: string;
	done?: number;
	total?: number;
	/** Games whose achievements Steam didn't give on the last full sync, and why. */
	skipped?: { gameId: number; name: string; reason: string }[];
}

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	/** Stored lowercase. */
	username: text('username').notNull().unique(),
	displayName: text('display_name').notNull(),
	passwordHash: text('password_hash').notNull(),
	role: text('role', { enum: ['admin', 'user'] })
		.notNull()
		.default('user'),
	disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
	prefs: text('prefs', { mode: 'json' }).$type<UserPrefs>().notNull().default({}),
	/** SteamID64 of the linked Steam account. */
	steamId: text('steam_id'),
	steamName: text('steam_name'),
	steamAvatar: text('steam_avatar'),
	steamSyncedAt: timestamp('steam_synced_at'),
	steamSync: text('steam_sync', { mode: 'json' })
		.$type<SteamSyncState>()
		.notNull()
		.default({ status: 'idle' }),
	createdAt: timestamp('created_at')
		.notNull()
		.$defaultFn(() => new Date())
});

export const sessions = sqliteTable(
	'sessions',
	{
		/** SHA-256 of the cookie token; the token itself is never stored. */
		id: text('id').primaryKey(),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at').notNull(),
		createdAt: timestamp('created_at')
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('sessions_user_idx').on(t.userId)]
);

// ---------- Games (shared by everyone on the server) ----------

/**
 * One row per game. A game that exists on Steam is identified by its Steam app id, whichever
 * platform each person plays it on; other games by their IGDB id, or neither for games added
 * by hand.
 */
export const games = sqliteTable(
	'games',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		steamAppId: integer('steam_app_id'),
		igdbId: integer('igdb_id'),
		name: text('name').notNull(),
		/** Portrait cover (3:4). */
		cover: text('cover'),
		/** Wide banner. */
		hero: text('hero'),
		summary: text('summary'),
		/** YYYY-MM-DD, or YYYY when only the year is known. */
		releaseDate: text('release_date'),
		developers: text('developers', { mode: 'json' }).$type<string[]>().notNull().default([]),
		genres: text('genres', { mode: 'json' }).$type<string[]>().notNull().default([]),
		/** Platforms the game came out on (IGDB abbreviations). */
		platforms: text('platforms', { mode: 'json' }).$type<string[]>().notNull().default([]),
		/** When the Steam achievement list was last read. */
		schemaUpdatedAt: timestamp('schema_updated_at'),
		/** When store/IGDB details were last read. */
		detailsUpdatedAt: timestamp('details_updated_at'),
		createdAt: timestamp('created_at')
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [
		uniqueIndex('games_steam_idx').on(t.steamAppId),
		uniqueIndex('games_igdb_idx').on(t.igdbId)
	]
);

/**
 * Achievements of a game: Steam's list (`source: 'steam'`, keyed by its API name), and checklist
 * items people add themselves (`source: 'custom'`), e.g. "every boss" for a Switch game.
 */
export const achievements = sqliteTable(
	'achievements',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		gameId: integer('game_id')
			.notNull()
			.references(() => games.id, { onDelete: 'cascade' }),
		/** Steam API name, or a generated key for custom items. */
		key: text('key').notNull(),
		source: text('source', { enum: ['steam', 'custom'] }).notNull(),
		name: text('name').notNull(),
		description: text('description'),
		icon: text('icon'),
		iconLocked: text('icon_locked'),
		hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
		/** Share of Steam players who have it (0–100). */
		globalPercent: real('global_percent'),
		sortOrder: integer('sort_order').notNull().default(0),
		createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: timestamp('created_at')
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [uniqueIndex('achievements_game_key_idx').on(t.gameId, t.key)]
);

// ---------- Each person's library ----------

export const libraryEntries = sqliteTable(
	'library_entries',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		gameId: integer('game_id')
			.notNull()
			.references(() => games.id, { onDelete: 'cascade' }),
		status: text('status').$type<GameStatus>().notNull(),
		/** Where this person plays it (Steam, PS5, Switch, …). */
		platform: text('platform'),
		/** Owned on the linked Steam account: achievements come from Steam. */
		steamOwned: integer('steam_owned', { mode: 'boolean' }).notNull().default(false),
		playtimeMinutes: integer('playtime_minutes').notNull().default(0),
		lastPlayedAt: timestamp('last_played_at'),
		/** Steam playtime when achievements were last read (a change means a new session). */
		syncedPlaytime: integer('synced_playtime'),
		achievementsSyncedAt: timestamp('achievements_synced_at'),
		/** 1–10. */
		rating: integer('rating'),
		notes: text('notes'),
		/** When every achievement was unlocked. */
		perfectedAt: timestamp('perfected_at'),
		addedAt: timestamp('added_at')
			.notNull()
			.$defaultFn(() => new Date()),
		updatedAt: timestamp('updated_at')
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [
		uniqueIndex('library_user_game_idx').on(t.userId, t.gameId),
		index('library_user_status_idx').on(t.userId, t.status)
	]
);

export const userAchievements = sqliteTable(
	'user_achievements',
	{
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		achievementId: integer('achievement_id')
			.notNull()
			.references(() => achievements.id, { onDelete: 'cascade' }),
		unlockedAt: timestamp('unlocked_at').notNull(),
		/** From Steam, or ticked by hand. */
		source: text('source', { enum: ['steam', 'manual'] }).notNull()
	},
	(t) => [
		primaryKey({ columns: [t.userId, t.achievementId] }),
		index('user_achievements_time_idx').on(t.userId, t.unlockedAt)
	]
);

// ---------- Notifications ----------

export const notificationTargets = sqliteTable(
	'notification_targets',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		type: text('type', { enum: ['ntfy', 'discord'] }).notNull(),
		/** ntfy topic URL or Discord webhook URL. */
		url: text('url').notNull(),
		enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
		lastError: text('last_error'),
		lastSentAt: timestamp('last_sent_at'),
		createdAt: timestamp('created_at')
			.notNull()
			.$defaultFn(() => new Date())
	},
	(t) => [index('notification_targets_user_idx').on(t.userId)]
);

export type UserRow = typeof users.$inferSelect;
export type GameRow = typeof games.$inferSelect;
export type AchievementRow = typeof achievements.$inferSelect;
export type LibraryEntryRow = typeof libraryEntries.$inferSelect;
