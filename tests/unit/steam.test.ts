import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../../src/lib/server/providers/http';
import {
	SteamPrivateError,
	getOwnedGames,
	getPlayerAchievements,
	mapOwnedGame,
	mapPlayerAchievements,
	mapSchema,
	parseSteamProfile,
	parseStoreDate
} from '../../src/lib/server/providers/steam';

describe('parseSteamProfile', () => {
	it('reads a SteamID64', () => {
		expect(parseSteamProfile(' 76561198000000001 ')).toEqual({ steamId: '76561198000000001' });
	});
	it('reads profile links', () => {
		expect(parseSteamProfile('https://steamcommunity.com/profiles/76561198000000001/')).toEqual({
			steamId: '76561198000000001'
		});
		expect(parseSteamProfile('https://steamcommunity.com/id/ashenone/')).toEqual({
			vanity: 'ashenone'
		});
		expect(parseSteamProfile('steamcommunity.com/id/ashen%20one?x=1')).toEqual({
			vanity: 'ashen one'
		});
	});
	it('takes a bare custom URL name', () => {
		expect(parseSteamProfile('ashen_one')).toEqual({ vanity: 'ashen_one' });
	});
	it('rejects anything else', () => {
		expect(parseSteamProfile('')).toBeNull();
		expect(parseSteamProfile('https://steamcommunity.com/profiles/123')).toBeNull();
		expect(parseSteamProfile('not a profile at all!')).toBeNull();
	});
});

describe('Steam mapping', () => {
	it('maps owned games', () => {
		expect(
			mapOwnedGame({
				appid: 1245620,
				name: ' ELDEN RING ',
				playtime_forever: 90,
				rtime_last_played: 1_700_000_000,
				has_community_visible_stats: true
			})
		).toEqual({
			appId: 1245620,
			name: 'ELDEN RING',
			playtimeMinutes: 90,
			lastPlayedAt: new Date(1_700_000_000_000),
			hasStats: true
		});
		expect(mapOwnedGame({ appid: 7 })).toMatchObject({
			name: 'App 7',
			playtimeMinutes: 0,
			lastPlayedAt: null,
			hasStats: false
		});
	});

	it('maps the achievement list in order, with hidden flags', () => {
		const schema = mapSchema([
			{
				name: 'A',
				displayName: 'First',
				description: 'Do it',
				icon: 'i',
				icongray: 'g',
				hidden: 0
			},
			{ name: 'B', displayName: 'Secret', hidden: 1 }
		]);
		expect(schema).toEqual([
			{
				apiName: 'A',
				name: 'First',
				description: 'Do it',
				icon: 'i',
				iconLocked: 'g',
				hidden: false,
				order: 0
			},
			{
				apiName: 'B',
				name: 'Secret',
				description: null,
				icon: null,
				iconLocked: null,
				hidden: true,
				order: 1
			}
		]);
	});

	it('maps unlocks, keeping old unlocks without a time', () => {
		expect(
			mapPlayerAchievements([
				{ apiname: 'A', achieved: 1, unlocktime: 1_600_000_000 },
				{ apiname: 'B', achieved: 0, unlocktime: 0 },
				{ apiname: 'C', achieved: 1, unlocktime: 0 }
			])
		).toEqual([
			{ apiName: 'A', unlockedAt: new Date(1_600_000_000_000) },
			{ apiName: 'B', unlockedAt: null },
			{ apiName: 'C', unlockedAt: new Date(0) }
		]);
	});

	it('reads store dates in either order', () => {
		expect(parseStoreDate('25 Feb, 2022')).toBe('2022-02-25');
		expect(parseStoreDate('Mar 3, 2016')).toBe('2016-03-03');
		expect(parseStoreDate('2024')).toBe('2024');
		expect(parseStoreDate('Coming soon')).toBeNull();
		expect(parseStoreDate(undefined)).toBeNull();
	});
});

describe('Steam refusals', () => {
	process.env.STEAM_API_KEY = 'test';
	afterEach(() => vi.unstubAllGlobals());
	const answer = (status: number, body: unknown) =>
		vi.stubGlobal('fetch', async () => new Response(JSON.stringify(body), { status }));

	it("treats a 403 on one game's achievements as that game's problem", async () => {
		answer(403, { playerstats: { error: 'Profile is not public', success: false } });
		const error = await getPlayerAchievements('76561198000000001', 570).catch((e) => e);
		expect(error).toBeInstanceOf(ProviderError);
		expect(error).not.toBeInstanceOf(SteamPrivateError);
	});

	it('reads a game without stats as having no achievements', async () => {
		answer(400, { playerstats: { error: 'Requested app has no stats', success: false } });
		expect(await getPlayerAchievements('76561198000000001', 570)).toBeNull();
	});

	it('calls game details private only when the owned-games list is withheld', async () => {
		answer(200, { response: {} });
		await expect(getOwnedGames('76561198000000001')).rejects.toBeInstanceOf(SteamPrivateError);
	});
});
