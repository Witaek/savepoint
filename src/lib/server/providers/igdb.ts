import { eq } from 'drizzle-orm';
import { config } from '../config';
import { getDb } from '../db/client';
import { appMeta } from '../db/schema';
import { createHttpClient } from './http';

/**
 * IGDB (api.igdb.com): games on every platform, with covers. Signs in with a Twitch app's
 * client id and secret (client credentials); the token lasts about two months and is kept in
 * app_meta. IGDB allows 4 requests a second.
 */

const request = createHttpClient('igdb', { burst: 4, perSecond: 3.5, concurrency: 4 });
const TOKEN_KEY = 'igdb_token';
const STEAM_SOURCE = 1;

export class IgdbNotConfiguredError extends Error {
	constructor() {
		super('IGDB is not configured: set IGDB_CLIENT_ID and IGDB_CLIENT_SECRET.');
		this.name = 'IgdbNotConfiguredError';
	}
}

async function token(): Promise<string> {
	const { IGDB_CLIENT_ID, IGDB_CLIENT_SECRET } = config();
	if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) throw new IgdbNotConfiguredError();
	const db = getDb();
	const stored = db.select().from(appMeta).where(eq(appMeta.key, TOKEN_KEY)).get();
	if (stored) {
		const { value, expiresAt } = JSON.parse(stored.value) as { value: string; expiresAt: number };
		if (expiresAt > Date.now() + 60_000) return value;
	}
	const url = new URL('https://id.twitch.tv/oauth2/token');
	url.searchParams.set('client_id', IGDB_CLIENT_ID);
	url.searchParams.set('client_secret', IGDB_CLIENT_SECRET);
	url.searchParams.set('grant_type', 'client_credentials');
	const data = await request<{ access_token: string; expires_in: number }>(url.toString(), {
		method: 'POST'
	});
	const record = JSON.stringify({
		value: data.access_token,
		expiresAt: Date.now() + data.expires_in * 1000
	});
	db.insert(appMeta)
		.values({ key: TOKEN_KEY, value: record })
		.onConflictDoUpdate({ target: appMeta.key, set: { value: record, updatedAt: new Date() } })
		.run();
	return data.access_token;
}

async function query<T>(endpoint: string, body: string): Promise<T> {
	return request<T>(`https://api.igdb.com/v4/${endpoint}`, {
		method: 'POST',
		headers: {
			'Client-ID': config().IGDB_CLIENT_ID!,
			Authorization: `Bearer ${await token()}`,
			'Content-Type': 'text/plain'
		},
		body
	});
}

export interface IgdbGame {
	igdbId: number;
	name: string;
	cover: string | null;
	hero: string | null;
	summary: string | null;
	releaseDate: string | null;
	developers: string[];
	genres: string[];
	platforms: string[];
	steamAppId: number | null;
}

export interface RawIgdbGame {
	id: number;
	name: string;
	cover?: { image_id: string };
	artworks?: { image_id: string }[];
	screenshots?: { image_id: string }[];
	summary?: string;
	first_release_date?: number;
	genres?: { name: string }[];
	platforms?: { abbreviation?: string; name: string }[];
	involved_companies?: { developer?: boolean; company?: { name: string } }[];
	external_games?: { external_game_source?: number; category?: number; uid?: string }[];
}

const FIELDS =
	'fields name,cover.image_id,artworks.image_id,screenshots.image_id,summary,first_release_date,' +
	'genres.name,platforms.abbreviation,platforms.name,involved_companies.developer,' +
	'involved_companies.company.name,external_games.external_game_source,external_games.category,' +
	'external_games.uid;';

const image = (size: string, id: string) =>
	`https://images.igdb.com/igdb/image/upload/t_${size}/${id}.jpg`;

export function mapIgdbGame(raw: RawIgdbGame): IgdbGame {
	const steam = raw.external_games?.find(
		(e) => (e.external_game_source ?? e.category) === STEAM_SOURCE && /^\d+$/.test(e.uid ?? '')
	);
	const wide = raw.artworks?.[0] ?? raw.screenshots?.[0];
	return {
		igdbId: raw.id,
		name: raw.name,
		cover: raw.cover ? image('cover_big_2x', raw.cover.image_id) : null,
		hero: wide ? image('1080p', wide.image_id) : null,
		summary: raw.summary?.trim() || null,
		releaseDate: raw.first_release_date
			? new Date(raw.first_release_date * 1000).toISOString().slice(0, 10)
			: null,
		developers: (raw.involved_companies ?? [])
			.filter((c) => c.developer && c.company)
			.map((c) => c.company!.name),
		genres: (raw.genres ?? []).map((g) => g.name),
		platforms: (raw.platforms ?? []).map((p) => p.abbreviation ?? p.name),
		steamAppId: steam ? Number(steam.uid) : null
	};
}

export async function searchIgdb(text: string): Promise<IgdbGame[]> {
	const escaped = text.replace(/["\\]/g, ' ').trim();
	if (!escaped) return [];
	const raw = await query<RawIgdbGame[]>('games', `search "${escaped}"; ${FIELDS} limit 24;`);
	return raw.map(mapIgdbGame);
}

export async function getIgdbGame(id: number): Promise<IgdbGame | null> {
	const raw = await query<RawIgdbGame[]>('games', `${FIELDS} where id = ${Math.trunc(id)};`);
	return raw[0] ? mapIgdbGame(raw[0]) : null;
}

/**
 * The games inside a bundle sold as one Steam app (Kingdom Hearts 1.5+2.5 → Kingdom Hearts Final
 * Mix, Re:Chain of Memories, …), in release order: names to suggest when splitting it. IGDB lists
 * on each game the bundles it's part of.
 */
export async function bundleContents(steamAppId: number): Promise<string[]> {
	const uid = Math.trunc(steamAppId);
	const links = await query<{ game?: number }[]>(
		'external_games',
		`fields game; where uid = "${uid}" & (external_game_source = ${STEAM_SOURCE} | category = ${STEAM_SOURCE}); limit 1;`
	);
	const bundleId = links[0]?.game;
	if (!bundleId) return [];
	const children = await query<{ name: string }[]>(
		'games',
		`fields name, first_release_date; where bundles = (${bundleId}); sort first_release_date asc; limit 30;`
	);
	return children.map((g) => g.name);
}
