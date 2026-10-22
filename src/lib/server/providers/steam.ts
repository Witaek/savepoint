import { config } from '../config';
import { ProviderError, createHttpClient } from './http';

/**
 * Steam Web API (api.steampowered.com) and the store's public endpoints.
 * Steam allows 100,000 calls a day per key; the limiter keeps bursts polite.
 */

const request = createHttpClient('steam', { burst: 6, perSecond: 4, concurrency: 4 });
// The store is stricter (about 200 requests per 5 minutes).
const storeRequest = createHttpClient('steam-store', { burst: 4, perSecond: 0.6, concurrency: 2 });

export class SteamNotConfiguredError extends Error {
	constructor() {
		super('Steam is not configured: set STEAM_API_KEY.');
		this.name = 'SteamNotConfiguredError';
	}
}

/** The profile or its game details are private, so Steam returns nothing about it. */
export class SteamPrivateError extends Error {
	constructor(what = 'game details') {
		super(
			`Steam keeps this profile's ${what} private. In Steam: Profile → Edit Profile → Privacy Settings → Game details: Public.`
		);
		this.name = 'SteamPrivateError';
	}
}

function apiUrl(path: string, params: Record<string, string | number>): string {
	const { STEAM_API_KEY, STEAM_API_URL } = config();
	if (!STEAM_API_KEY) throw new SteamNotConfiguredError();
	const url = new URL(path, STEAM_API_URL);
	url.searchParams.set('key', STEAM_API_KEY);
	for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
	return url.toString();
}

// ---------- Profiles ----------

const STEAM_ID = /^7656119\d{10}$/;

/**
 * Reads what someone pasted: a SteamID64, a profile link (/profiles/<id> or /id/<name>), or a
 * custom URL name. Returns the id, or the custom name to resolve.
 */
export function parseSteamProfile(input: string): { steamId: string } | { vanity: string } | null {
	const value = input.trim().replace(/\/+$/, '');
	if (!value) return null;
	if (STEAM_ID.test(value)) return { steamId: value };
	const link = value.match(/steamcommunity\.com\/(profiles|id)\/([^/?#]+)/i);
	if (link) {
		if (link[1].toLowerCase() === 'profiles') {
			return STEAM_ID.test(link[2]) ? { steamId: link[2] } : null;
		}
		return { vanity: decodeURIComponent(link[2]) };
	}
	if (/^[\w-]{2,32}$/.test(value)) return { vanity: value };
	return null;
}

export async function resolveVanity(vanity: string): Promise<string | null> {
	const data = await request<{ response: { success: number; steamid?: string } }>(
		apiUrl('/ISteamUser/ResolveVanityURL/v1/', { vanityurl: vanity })
	);
	return data.response.success === 1 && data.response.steamid ? data.response.steamid : null;
}

export interface SteamProfile {
	steamId: string;
	name: string;
	avatar: string | null;
	/** 3 = public. Private profiles return no games or achievements. */
	isPublic: boolean;
}

export async function getProfile(steamId: string): Promise<SteamProfile | null> {
	const data = await request<{
		response: {
			players: {
				steamid: string;
				personaname: string;
				avatarfull?: string;
				communityvisibilitystate?: number;
			}[];
		};
	}>(apiUrl('/ISteamUser/GetPlayerSummaries/v2/', { steamids: steamId }));
	const player = data.response.players[0];
	if (!player) return null;
	return {
		steamId: player.steamid,
		name: player.personaname,
		avatar: player.avatarfull ?? null,
		isPublic: player.communityvisibilitystate === 3
	};
}

// ---------- Library ----------

export interface OwnedGame {
	appId: number;
	name: string;
	playtimeMinutes: number;
	lastPlayedAt: Date | null;
	/** Steam only reports this for games with achievements or stats. */
	hasStats: boolean;
}

interface RawOwnedGame {
	appid: number;
	name?: string;
	playtime_forever?: number;
	rtime_last_played?: number;
	has_community_visible_stats?: boolean;
}

export function mapOwnedGame(raw: RawOwnedGame): OwnedGame {
	return {
		appId: raw.appid,
		name: raw.name?.trim() || `App ${raw.appid}`,
		playtimeMinutes: raw.playtime_forever ?? 0,
		lastPlayedAt: raw.rtime_last_played ? new Date(raw.rtime_last_played * 1000) : null,
		hasStats: Boolean(raw.has_community_visible_stats)
	};
}

/** Every game on the account. An empty response means the game details are private. */
export async function getOwnedGames(steamId: string): Promise<OwnedGame[]> {
	const data = await request<{ response: { game_count?: number; games?: RawOwnedGame[] } }>(
		apiUrl('/IPlayerService/GetOwnedGames/v1/', {
			steamid: steamId,
			include_appinfo: 1,
			include_played_free_games: 1,
			skip_unvetted_apps: 0
		})
	);
	if (data.response.game_count === undefined) throw new SteamPrivateError();
	return (data.response.games ?? []).map(mapOwnedGame);
}

/** Games played in the last two weeks. */
export async function getRecentlyPlayed(steamId: string): Promise<OwnedGame[]> {
	const data = await request<{ response: { total_count?: number; games?: RawOwnedGame[] } }>(
		apiUrl('/IPlayerService/GetRecentlyPlayedGames/v1/', { steamid: steamId, count: 0 })
	);
	return (data.response.games ?? []).map(mapOwnedGame);
}

export interface WishlistItem {
	appId: number;
	priority: number;
	addedAt: Date | null;
}

/** The public wishlist. This endpoint is undocumented, so failures are not fatal. */
export async function getWishlist(steamId: string): Promise<WishlistItem[]> {
	const data = await request<{
		response: { items?: { appid: number; priority?: number; date_added?: number }[] };
	}>(apiUrl('/IWishlistService/GetWishlist/v1/', { steamid: steamId }));
	return (data.response.items ?? []).map((item) => ({
		appId: item.appid,
		priority: item.priority ?? 0,
		addedAt: item.date_added ? new Date(item.date_added * 1000) : null
	}));
}

// ---------- Achievements ----------

export interface SchemaAchievement {
	apiName: string;
	name: string;
	description: string | null;
	icon: string | null;
	iconLocked: string | null;
	hidden: boolean;
	order: number;
}

interface RawSchemaAchievement {
	name: string;
	displayName?: string;
	description?: string;
	icon?: string;
	icongray?: string;
	hidden?: number;
}

export function mapSchema(raw: RawSchemaAchievement[]): SchemaAchievement[] {
	return raw.map((a, order) => ({
		apiName: a.name,
		name: a.displayName?.trim() || a.name,
		description: a.description?.trim() || null,
		icon: a.icon || null,
		iconLocked: a.icongray || null,
		hidden: a.hidden === 1,
		order
	}));
}

/** The achievement list of a game, in Steam's order. Empty when the game has none. */
export async function getSchema(appId: number): Promise<SchemaAchievement[]> {
	try {
		const data = await request<{
			game?: { availableGameStats?: { achievements?: RawSchemaAchievement[] } };
		}>(
			apiUrl('/ISteamUserStats/GetSchemaForGame/v2/', { appid: appId, l: config().STEAM_LANGUAGE })
		);
		return mapSchema(data.game?.availableGameStats?.achievements ?? []);
	} catch (error) {
		// Removed or unlisted apps answer 400/403.
		if (error instanceof ProviderError && (error.status === 400 || error.status === 403)) return [];
		throw error;
	}
}

export interface PlayerAchievement {
	apiName: string;
	unlockedAt: Date | null;
}

interface RawPlayerAchievement {
	apiname: string;
	achieved: number;
	unlocktime?: number;
}

export function mapPlayerAchievements(raw: RawPlayerAchievement[]): PlayerAchievement[] {
	return raw.map((a) => ({
		apiName: a.apiname,
		unlockedAt: a.achieved
			? // A few old unlocks have no time; they count as unlocked at the epoch.
				new Date((a.unlocktime ?? 0) * 1000)
			: null
	}));
}

/** One player's achievements for a game. Null when the game has no achievements. */
export async function getPlayerAchievements(
	steamId: string,
	appId: number
): Promise<PlayerAchievement[] | null> {
	try {
		const data = await request<{
			playerstats: { success?: boolean; error?: string; achievements?: RawPlayerAchievement[] };
		}>(apiUrl('/ISteamUserStats/GetPlayerAchievements/v1/', { steamid: steamId, appid: appId }), {
			retries: 1
		});
		return data.playerstats.achievements
			? mapPlayerAchievements(data.playerstats.achievements)
			: null;
	} catch (error) {
		// 400 "Requested app has no stats". Steam also refuses some games with 403 (even "Profile
		// is not public") on a public profile, so a 403 here is about this game only: whether the
		// game details are private is decided by the owned-games list (getOwnedGames).
		if (error instanceof ProviderError && error.status === 400) return null;
		throw error;
	}
}

/** Share of players with each achievement, by API name (0–100). */
export async function getGlobalPercentages(appId: number): Promise<Map<string, number>> {
	try {
		const data = await request<{
			achievementpercentages?: { achievements?: { name: string; percent: number | string }[] };
		}>(apiUrl('/ISteamUserStats/GetGlobalAchievementPercentagesForApp/v2/', { gameid: appId }));
		const list = data.achievementpercentages?.achievements ?? [];
		return new Map(list.map((a) => [a.name, Number(a.percent)] as const));
	} catch (error) {
		if (error instanceof ProviderError && (error.status === 400 || error.status === 403)) {
			return new Map();
		}
		throw error;
	}
}

// ---------- Store (no key) ----------

export interface StoreDetails {
	appId: number;
	name: string;
	summary: string | null;
	releaseDate: string | null;
	developers: string[];
	genres: string[];
	header: string | null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** "14 Mar, 2024", "Mar 14, 2024" or "2024" → "2024-03-14" / "2024". */
export function parseStoreDate(value: string | undefined): string | null {
	if (!value) return null;
	const year = value.match(/\b(19|20)\d{2}\b/)?.[0];
	if (!year) return null;
	const month = MONTHS.findIndex((m) => value.toLowerCase().includes(m));
	const day = value.replace(year, '').match(/\b(\d{1,2})\b/)?.[1];
	if (month < 0 || !day) return year;
	return `${year}-${String(month + 1).padStart(2, '0')}-${day.padStart(2, '0')}`;
}

const stripHtml = (html: string) =>
	html
		.replace(/<br\s*\/?>/gi, '\n')
		.replace(/<[^>]+>/g, '')
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, '&')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.trim();

export async function getStoreDetails(appId: number): Promise<StoreDetails | null> {
	const { STEAM_STORE_URL, STORE_COUNTRY } = config();
	const url = new URL('/api/appdetails', STEAM_STORE_URL);
	url.searchParams.set('appids', String(appId));
	url.searchParams.set('cc', STORE_COUNTRY);
	url.searchParams.set('l', config().STEAM_LANGUAGE);
	const data = await storeRequest<
		Record<
			string,
			{
				success: boolean;
				data?: {
					name: string;
					short_description?: string;
					release_date?: { date?: string };
					developers?: string[];
					genres?: { description: string }[];
					header_image?: string;
				};
			}
		>
	>(url.toString());
	const entry = data[String(appId)];
	if (!entry?.success || !entry.data) return null;
	const d = entry.data;
	return {
		appId,
		name: d.name,
		summary: d.short_description ? stripHtml(d.short_description) : null,
		releaseDate: parseStoreDate(d.release_date?.date),
		developers: d.developers ?? [],
		genres: (d.genres ?? []).map((g) => g.description),
		header: d.header_image ?? null
	};
}

export interface StoreSearchResult {
	appId: number;
	name: string;
}

/** Store search, used when IGDB isn't configured. */
export async function searchStore(query: string): Promise<StoreSearchResult[]> {
	const { STEAM_STORE_URL, STORE_COUNTRY } = config();
	const url = new URL('/api/storesearch/', STEAM_STORE_URL);
	url.searchParams.set('term', query);
	url.searchParams.set('cc', STORE_COUNTRY);
	url.searchParams.set('l', 'english');
	const data = await storeRequest<{ items?: { id: number; name: string; type?: string }[] }>(
		url.toString()
	);
	return (data.items ?? [])
		.filter((item) => !item.type || item.type === 'app')
		.map((item) => ({ appId: item.id, name: item.name }));
}
