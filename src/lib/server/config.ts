import { resolve } from 'node:path';
import { z } from 'zod';

const csv = z
	.string()
	.optional()
	.transform((value) =>
		(value ?? '')
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean)
	);

const blankToUndefined = (value: unknown) =>
	typeof value === 'string' && value.trim() === '' ? undefined : value;

const optionalString = z.preprocess(blankToUndefined, z.string().optional());

const schema = z.object({
	DATA_DIR: z.string().default('./data'),
	APP_URL: z.preprocess(blankToUndefined, z.url().optional()),
	ALLOWED_ORIGINS: csv,
	/** Steam Web API key (steamcommunity.com/dev/apikey). Without it, Steam import is off. */
	STEAM_API_KEY: optionalString,
	/** Language of achievement names and descriptions, as Steam names it (english, french, …). */
	STEAM_LANGUAGE: z.string().default('english'),
	/** Country for store data (two letters). */
	STORE_COUNTRY: z.string().length(2).default('US'),
	/** IGDB (Twitch) credentials: search for games on any platform. Optional. */
	IGDB_CLIENT_ID: optionalString,
	IGDB_CLIENT_SECRET: optionalString,
	TZ: z.string().default('UTC'),
	BACKUP_RETENTION_DAYS: z.coerce.number().int().min(0).default(14),
	ADMIN_USERNAME: optionalString,
	ADMIN_PASSWORD: optionalString,
	/** Development/testing: don't start background jobs (no outgoing requests). */
	DISABLE_JOBS: z
		.string()
		.optional()
		.transform((v) => v === '1' || v === 'true'),
	/** Testing: where the Steam Web API and store are reached (a local mock in e2e tests). */
	STEAM_API_URL: z.url().default('https://api.steampowered.com'),
	STEAM_STORE_URL: z.url().default('https://store.steampowered.com')
});

export type Config = z.infer<typeof schema> & {
	dataDir: string;
	databasePath: string;
	steamConfigured: boolean;
	igdbConfigured: boolean;
};

export function parseConfig(env: Record<string, string | undefined>): Config {
	const parsed = schema.safeParse(env);
	if (!parsed.success) {
		const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
		throw new Error(`Invalid configuration:\n${issues.join('\n')}`);
	}
	const data = parsed.data;
	const dataDir = resolve(data.DATA_DIR);
	return {
		...data,
		STORE_COUNTRY: data.STORE_COUNTRY.toUpperCase(),
		dataDir,
		databasePath: resolve(dataDir, 'savepoint.db'),
		steamConfigured: Boolean(data.STEAM_API_KEY),
		igdbConfigured: Boolean(data.IGDB_CLIENT_ID && data.IGDB_CLIENT_SECRET)
	};
}

let cached: Config | undefined;

export function config(): Config {
	cached ??= parseConfig(process.env);
	return cached;
}
