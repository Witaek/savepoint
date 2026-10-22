import { steamImage } from '$lib/games';
import { HOUR, cached } from '../cache';
import { config } from '../config';
import { getIgdbGame, searchIgdb, type IgdbGame } from '../providers/igdb';
import { searchStore } from '../providers/steam';
import { ensureIgdbGame, ensureSteamGame } from './games';

/** Search on IGDB (every platform) when it's configured, otherwise on the Steam store. */

export interface SearchResult {
	/** "igdb:<id>" or "steam:<app id>": what the Add button sends back. */
	key: string;
	name: string;
	cover: string | null;
	year: string | null;
	platforms: string[];
	steamAppId: number | null;
}

const fromIgdb = (g: IgdbGame): SearchResult => ({
	key: `igdb:${g.igdbId}`,
	name: g.name,
	cover: g.cover ?? (g.steamAppId ? steamImage.cover(g.steamAppId) : null),
	year: g.releaseDate?.slice(0, 4) ?? null,
	platforms: g.platforms,
	steamAppId: g.steamAppId
});

export const searchSource = (): 'igdb' | 'steam' => (config().igdbConfigured ? 'igdb' : 'steam');

export async function searchGames(query: string): Promise<SearchResult[]> {
	const q = query.trim().toLowerCase();
	if (q.length < 2) return [];
	if (searchSource() === 'igdb') {
		return cached(`search:igdb:${q}`, 6 * HOUR, async () => (await searchIgdb(q)).map(fromIgdb));
	}
	return cached(`search:steam:${q}`, 6 * HOUR, async () =>
		(await searchStore(q)).map((r) => ({
			key: `steam:${r.appId}`,
			name: r.name,
			cover: steamImage.cover(r.appId),
			year: null,
			platforms: ['PC'],
			steamAppId: r.appId
		}))
	);
}

/** Stores the game behind a search result and returns its id. */
export async function gameFromKey(key: string, name: string): Promise<number | null> {
	const [source, raw] = key.split(':');
	const id = Number(raw);
	if (!Number.isInteger(id) || id <= 0) return null;
	if (source === 'steam') return ensureSteamGame(id, name);
	if (source === 'igdb') {
		const game = await getIgdbGame(id);
		return game ? ensureIgdbGame(game) : null;
	}
	return null;
}
