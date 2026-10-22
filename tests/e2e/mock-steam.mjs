// A stand-in for the Steam Web API and store, for end-to-end tests and local development:
//   node tests/e2e/mock-steam.mjs            (port 4400)
// then run Savepoint with STEAM_API_KEY=test STEAM_API_URL=http://localhost:4400
// STEAM_STORE_URL=http://localhost:4400. Test data only: names and numbers are made up.
import { createServer } from 'node:http';

const PORT = Number(process.env.MOCK_STEAM_PORT ?? 4400);
const STEAM_ID = '76561198000000001';
const DAY = 86400;
const now = Math.floor(Date.now() / 1000);

/** Games, each with its achievements: [api name, name, description, hidden, global %]. */
const GAMES = [
	{
		appid: 1245620,
		name: 'ELDEN RING',
		playtime: 8520,
		lastPlayed: now - 3600,
		unlocked: 38,
		achievements: [
			['ELDEN_RING', 'Elden Ring', 'Obtained all achievements', 0, 6.1],
			['LEGENDARY_ARMAMENTS', 'Legendary Armaments', 'Acquired all legendary armaments', 0, 21.4],
			[
				'LEGENDARY_SORCERIES',
				'Legendary Sorceries and Incantations',
				'Acquired all legendary sorceries and incantations',
				0,
				19.0
			],
			['AGE_OF_STARS', 'Age of the Stars', 'Achieved the "Age of the Stars" ending', 1, 16.8],
			[
				'FRENZIED_FLAME',
				'Lord of Frenzied Flame',
				'Achieved the "Lord of Frenzied Flame" ending',
				1,
				17.2
			],
			...Array.from({ length: 37 }, (_, i) => [
				`BOSS_${i + 1}`,
				`Shardbearer ${['Godrick', 'Rennala', 'Radahn', 'Rykard', 'Morgott', 'Mohg', 'Malenia'][i % 7]}${i >= 7 ? ` ${Math.floor(i / 7) + 1}` : ''}`,
				`Defeated a great enemy (${i + 1})`,
				0,
				Math.max(8, 72 - i * 1.7)
			])
		]
	},
	{
		appid: 374320,
		name: 'DARK SOULS™ III',
		playtime: 6100,
		lastPlayed: now - 40 * DAY,
		unlocked: 41,
		achievements: Array.from({ length: 43 }, (_, i) => [
			`ACH_${i}`,
			i === 0 ? 'The Dark Soul' : i === 1 ? 'Master of Infusion' : `Ashen One ${i}`,
			i === 0 ? 'Obtained all achievements' : `A trial of the Ashen One (${i})`,
			i % 9 === 0 ? 1 : 0,
			i === 0 ? 4.2 : Math.max(5, 80 - i * 1.6)
		])
	},
	{
		appid: 2552430,
		name: 'KINGDOM HEARTS -HD 1.5+2.5 ReMIX-',
		playtime: 5760,
		lastPlayed: now - 3 * DAY,
		unlocked: 61,
		achievements: Array.from({ length: 100 }, (_, i) => [
			`KH_${String(i).padStart(3, '0')}`,
			`Keyblade Trial ${i + 1}`,
			`A test of the heart (${i + 1})`,
			i % 25 === 24 ? 1 : 0,
			Math.max(3, 70 - i * 0.6)
		])
	},
	{
		appid: 814380,
		name: 'Sekiro™: Shadows Die Twice',
		playtime: 4200,
		lastPlayed: now - 200 * DAY,
		unlocked: 34,
		perfectAt: now - 200 * DAY,
		achievements: Array.from({ length: 34 }, (_, i) => [
			`SEK_${i}`,
			i === 0 ? 'Shinobi' : `Way of the Shinobi ${i}`,
			i === 0 ? 'Obtained all achievements' : `Mastered a skill (${i})`,
			0,
			i === 0 ? 5.6 : Math.max(6, 85 - i * 2)
		])
	},
	{
		appid: 367520,
		name: 'Hollow Knight',
		playtime: 3300,
		lastPlayed: now - 90 * DAY,
		unlocked: 57,
		achievements: Array.from({ length: 63 }, (_, i) => [
			`HK_${i}`,
			`Hallownest ${i + 1}`,
			`Explored the kingdom (${i + 1})`,
			0,
			Math.max(1.5, 60 - i)
		])
	},
	{ appid: 1145360, name: 'Hades', playtime: 0, lastPlayed: 0, unlocked: 0, achievements: [] },
	{
		appid: 1888160,
		name: 'ARMORED CORE™ VI FIRES OF RUBICON™',
		playtime: 1900,
		lastPlayed: now - 400 * DAY,
		unlocked: 12,
		achievements: Array.from({ length: 49 }, (_, i) => [
			`AC_${i}`,
			`Mercenary ${i + 1}`,
			`Completed a mission (${i + 1})`,
			0,
			Math.max(4, 75 - i * 1.4)
		])
	}
];

/** Lets a test unlock more: POST /mock/unlock?appid=…&count=… */
const extraUnlocks = new Map();

const byApp = new Map(GAMES.map((g) => [g.appid, g]));
const iconUrl = (game, name, gray) =>
	`https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/${game.appid}/${name}${gray ? '_gray' : ''}.jpg`;

function unlockedCount(game) {
	return Math.min(game.achievements.length, game.unlocked + (extraUnlocks.get(game.appid) ?? 0));
}

function routes(url) {
	const p = url.pathname.replace(/\/+$/, '/');
	const q = url.searchParams;
	const appid = Number(q.get('appid') ?? q.get('gameid') ?? 0);
	const game = byApp.get(appid);

	if (p.startsWith('/ISteamUser/ResolveVanityURL/')) {
		return q.get('vanityurl') === 'ashenone'
			? { response: { success: 1, steamid: STEAM_ID } }
			: { response: { success: 42, message: 'No match' } };
	}
	if (p.startsWith('/ISteamUser/GetPlayerSummaries/')) {
		return q.get('steamids') === STEAM_ID
			? {
					response: {
						players: [{ steamid: STEAM_ID, personaname: 'Ashen One', communityvisibilitystate: 3 }]
					}
				}
			: { response: { players: [] } };
	}
	if (p.startsWith('/IPlayerService/GetOwnedGames/')) {
		return {
			response: {
				game_count: GAMES.length,
				games: GAMES.map((g) => ({
					appid: g.appid,
					name: g.name,
					playtime_forever: g.playtime,
					rtime_last_played: g.lastPlayed,
					has_community_visible_stats: g.achievements.length > 0
				}))
			}
		};
	}
	if (p.startsWith('/IPlayerService/GetRecentlyPlayedGames/')) {
		const recent = GAMES.filter((g) => now - g.lastPlayed < 14 * DAY);
		return {
			response: {
				total_count: recent.length,
				games: recent.map((g) => ({
					appid: g.appid,
					name: g.name,
					playtime_2weeks: 300,
					playtime_forever: g.playtime + (extraUnlocks.get(g.appid) ? 30 : 0)
				}))
			}
		};
	}
	if (p.startsWith('/IWishlistService/GetWishlist/')) {
		return { response: { items: [{ appid: 2622380, priority: 1, date_added: now - 30 * DAY }] } };
	}
	if (p.startsWith('/ISteamUserStats/GetSchemaForGame/')) {
		if (!game || game.achievements.length === 0) return { game: {} };
		return {
			game: {
				gameName: game.name,
				availableGameStats: {
					achievements: game.achievements.map(([name, displayName, description, hidden]) => ({
						name,
						displayName,
						hidden,
						// Like Steam, hidden achievements often come without a description.
						...(hidden ? {} : { description }),
						icon: iconUrl(game, name, false),
						icongray: iconUrl(game, name, true)
					}))
				}
			}
		};
	}
	if (p.startsWith('/ISteamUserStats/GetPlayerAchievements/')) {
		if (!game || game.achievements.length === 0) {
			return [400, { playerstats: { error: 'Requested app has no stats', success: false } }];
		}
		const n = unlockedCount(game);
		// Unlock the rarest last: an all-achievements meta achievement comes at the end.
		const order = [...game.achievements].sort((a, b) => b[4] - a[4]);
		const got = new Set(order.slice(0, n).map((a) => a[0]));
		return {
			playerstats: {
				steamID: STEAM_ID,
				gameName: game.name,
				success: true,
				achievements: game.achievements.map(([apiname], i) => ({
					apiname,
					achieved: got.has(apiname) ? 1 : 0,
					unlocktime: got.has(apiname) ? (game.perfectAt ?? game.lastPlayed) - i * 3600 : 0
				}))
			}
		};
	}
	if (p.startsWith('/ISteamUserStats/GetGlobalAchievementPercentagesForApp/')) {
		if (!game) return [403, {}];
		return {
			achievementpercentages: {
				achievements: game.achievements.map(([name, , , , percent]) => ({
					name,
					percent: String(percent)
				}))
			}
		};
	}
	if (p === '/api/appdetails/') {
		const id = Number(q.get('appids'));
		const known = byApp.get(id) ?? (id === 2622380 ? { name: 'ELDEN RING NIGHTREIGN' } : null);
		if (!known) return { [id]: { success: false } };
		return {
			[id]: {
				success: true,
				data: {
					name: known.name,
					short_description: `Test description for ${known.name}.`,
					release_date: { date: '25 Feb, 2022' },
					developers: ['Test Studio'],
					genres: [{ description: 'Action' }, { description: 'RPG' }]
				}
			}
		};
	}
	if (p === '/api/storesearch/') {
		const term = (q.get('term') ?? '').toLowerCase();
		return {
			total: 1,
			items: [...GAMES, { appid: 2622380, name: 'ELDEN RING NIGHTREIGN' }]
				.filter((g) => g.name.toLowerCase().includes(term))
				.map((g) => ({ type: 'app', id: g.appid, name: g.name }))
		};
	}
	return null;
}

const server = createServer((req, res) => {
	const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
	if (req.method === 'POST' && url.pathname === '/mock/unlock') {
		const appid = Number(url.searchParams.get('appid'));
		extraUnlocks.set(
			appid,
			(extraUnlocks.get(appid) ?? 0) + Number(url.searchParams.get('count') ?? 1)
		);
		res.writeHead(204).end();
		return;
	}
	if (url.pathname === '/health') {
		res.writeHead(200).end('ok');
		return;
	}
	if (url.pathname.startsWith('/I') && url.searchParams.get('key') !== 'test') {
		res.writeHead(403, { 'content-type': 'text/html' }).end('<h1>Forbidden</h1>');
		return;
	}
	const result = routes(url);
	if (result === null) {
		res.writeHead(404).end('not found');
		return;
	}
	const [status, body] = Array.isArray(result) ? result : [200, result];
	res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
});

server.listen(PORT, () => console.log(`[mock-steam] listening on http://localhost:${PORT}`));
