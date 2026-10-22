import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dataDir = mkdtempSync(join(tmpdir(), 'savepoint-test-'));
process.env.DATA_DIR = dataDir;
process.env.STEAM_API_KEY = 'test';

const DAY = 86_400_000;
const STEAM_ID = '76561198000000001';

/** A fake Steam account the tests change as they go. */
const steam = {
	owned: [] as {
		appId: number;
		name: string;
		playtimeMinutes: number;
		lastPlayedAt: Date | null;
		hasStats: boolean;
	}[],
	schema: new Map<number, string[]>(),
	unlocked: new Map<number, Set<string>>(),
	/** Games Steam answers 403 for, as it does for some games on public profiles. */
	refused: new Set<number>()
};

vi.mock('../../src/lib/server/providers/steam', async (importOriginal) => {
	const real = await importOriginal<typeof import('../../src/lib/server/providers/steam')>();
	const { ProviderError } = await import('../../src/lib/server/providers/http');
	return {
		...real,
		getProfile: async (steamId: string) => ({
			steamId,
			name: 'Ashen One',
			avatar: null,
			isPublic: true
		}),
		resolveVanity: async () => STEAM_ID,
		getOwnedGames: async () => steam.owned.map((g) => ({ ...g })),
		getRecentlyPlayed: async () =>
			steam.owned.filter((g) => g.lastPlayedAt && Date.now() - g.lastPlayedAt.getTime() < 14 * DAY),
		getWishlist: async () => [],
		getStoreDetails: async () => null,
		getSchema: async (appId: number) =>
			(steam.schema.get(appId) ?? []).map((apiName, order) => ({
				apiName,
				name: `Name of ${apiName}`,
				description: null,
				icon: null,
				iconLocked: null,
				hidden: false,
				order
			})),
		getGlobalPercentages: async (appId: number) =>
			new Map((steam.schema.get(appId) ?? []).map((a, i) => [a, 50 - i] as const)),
		getPlayerAchievements: async (_: string, appId: number) => {
			if (steam.refused.has(appId)) {
				throw new ProviderError(
					'steam responded 403: {"playerstats":{"error":"Profile is not public","success":false}}',
					'steam',
					403
				);
			}
			const list = steam.schema.get(appId);
			if (!list?.length) return null;
			const got = steam.unlocked.get(appId) ?? new Set();
			return list.map((apiName) => ({
				apiName,
				unlockedAt: got.has(apiName) ? new Date(Date.now() - DAY) : null
			}));
		}
	};
});

const { runMigrations, closeDb, getDb } = await import('../../src/lib/server/db/client');
const { createUser } = await import('../../src/lib/server/auth');
const schema = await import('../../src/lib/server/db/schema');
const sync = await import('../../src/lib/server/services/steam-sync');
const library = await import('../../src/lib/server/services/library');
const achievementsService = await import('../../src/lib/server/services/achievements');
const gamesService = await import('../../src/lib/server/services/games');
const { eq } = await import('drizzle-orm');

let userId: number;
const sent: { url: string; body: Record<string, unknown> }[] = [];

beforeAll(async () => {
	runMigrations();
	userId = await createUser({ username: 'ashen', password: 'password123', role: 'admin' });
	getDb()
		.insert(schema.notificationTargets)
		.values({ userId, type: 'ntfy', url: 'https://ntfy.example/topic' })
		.run();
	vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
		sent.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
		return new Response('{}', { status: 200 });
	});

	steam.owned = [
		{
			appId: 10,
			name: 'Elden Ring',
			playtimeMinutes: 600,
			lastPlayedAt: new Date(Date.now() - DAY),
			hasStats: true
		},
		{
			appId: 20,
			name: 'Sekiro',
			playtimeMinutes: 3000,
			lastPlayedAt: new Date(Date.now() - 300 * DAY),
			hasStats: true
		},
		{ appId: 30, name: 'Hades', playtimeMinutes: 0, lastPlayedAt: null, hasStats: false }
	];
	steam.schema.set(10, ['A', 'B', 'C', 'D']);
	steam.schema.set(20, ['X', 'Y']);
	steam.unlocked.set(10, new Set(['A']));
	steam.unlocked.set(20, new Set(['X', 'Y']));
});

afterAll(() => {
	vi.unstubAllGlobals();
	closeDb();
	rmSync(dataDir, { recursive: true, force: true });
});

const gameId = (appId: number) => gamesService.findSteamGame(appId)!.id;
const entry = (appId: number) => library.getEntry(userId, gameId(appId))!;

describe('linking and the first sync', () => {
	beforeEach(() => (sent.length = 0));

	it('imports every owned game with a status that fits', async () => {
		expect(await sync.linkSteam(userId, 'https://steamcommunity.com/id/ashenone')).toBeNull();
		// linkSteam starts the sync in the background; wait for it.
		await vi.waitFor(() => expect(sync.isSyncing(userId)).toBe(false));
		await sync.fullSync(userId); // no-op while running, harmless after

		expect(entry(10).status).toBe('playing'); // played yesterday
		expect(entry(30).status).toBe('backlog'); // never played
		expect(entry(10).steamOwned).toBe(true);
		expect(library.progressFor(userId, gameId(10))).toEqual({ unlocked: 1, total: 4 });
	});

	it('marks a 100% game perfected and Beaten, without notifying on the first import', () => {
		expect(entry(20).perfectedAt).toBeInstanceOf(Date);
		expect(entry(20).status).toBe('beaten');
		expect(sent).toHaveLength(0);
	});
});

describe('later syncs', () => {
	beforeEach(() => (sent.length = 0));

	it('reads only recently played games, and notifies new unlocks', async () => {
		steam.unlocked.set(10, new Set(['A', 'B', 'C']));
		steam.owned[0].playtimeMinutes += 60;
		await sync.quickSync(userId);
		expect(library.progressFor(userId, gameId(10))).toEqual({ unlocked: 3, total: 4 });
		expect(sent).toHaveLength(1);
		expect(sent[0].body.title).toBe('2 achievements unlocked');
		expect(String(sent[0].body.message)).toContain('Elden Ring · 3/4');
	});

	it('skips games whose playtime did not change', async () => {
		steam.unlocked.set(10, new Set(['A', 'B', 'C', 'D']));
		await sync.quickSync(userId);
		expect(library.progressFor(userId, gameId(10)).unlocked).toBe(3);
	});

	it('celebrates a 100% with its own message', async () => {
		steam.owned[0].playtimeMinutes += 30;
		await sync.quickSync(userId);
		expect(entry(10).perfectedAt).toBeInstanceOf(Date);
		expect(sent.map((m) => m.body.title)).toEqual(['Perfection achieved: Elden Ring']);
	});

	it('mirrors a Steam reset', async () => {
		steam.unlocked.set(10, new Set(['A']));
		await sync.fullSync(userId, { all: true });
		expect(library.progressFor(userId, gameId(10))).toEqual({ unlocked: 1, total: 4 });
		expect(entry(10).perfectedAt).toBeNull();
	});

	it('adds games bought since and moves wishlisted ones out of the wishlist', async () => {
		const wished = gamesService.ensureSteamGame(40, 'Nightreign');
		library.addToLibrary(userId, wished, { status: 'wishlist', platform: 'Steam' });
		steam.owned.push({
			appId: 40,
			name: 'Nightreign',
			playtimeMinutes: 0,
			lastPlayedAt: null,
			hasStats: false
		});
		await sync.fullSync(userId);
		expect(entry(40)).toMatchObject({ status: 'backlog', steamOwned: true });
	});
});

describe('ticking and checklists', () => {
	it('refuses to tick Steam achievements of a game owned on Steam', () => {
		const [a] = achievementsService.achievementsFor(userId, gameId(10));
		expect(() => achievementsService.setUnlocked(userId, a.id, true)).toThrow(/comes from Steam/);
	});

	it('lets you tick checklist items, and a new item takes a game off 100%', () => {
		const sekiro = gameId(20);
		expect(entry(20).perfectedAt).not.toBeNull();
		const item = achievementsService.addChecklistItem(userId, sekiro, { name: 'Every prosthetic' });
		expect(entry(20).perfectedAt).toBeNull();
		expect(achievementsService.setUnlocked(userId, item, true)).toEqual({ perfected: true });
		expect(entry(20).perfectedAt).not.toBeNull();
	});

	it('lets you tick Steam achievements of a copy played elsewhere', async () => {
		const other = await createUser({ username: 'friend', password: 'password123', role: 'user' });
		library.addToLibrary(other, gameId(10), { status: 'playing', platform: 'PS5' });
		const [a] = achievementsService.achievementsFor(other, gameId(10));
		achievementsService.setUnlocked(other, a.id, true);
		expect(library.progressFor(other, gameId(10)).unlocked).toBe(1);
		// Someone else's checklist item can't be removed by a member.
		const item = achievementsService.addChecklistItem(userId, gameId(10), { name: 'All bosses' });
		expect(() =>
			achievementsService.deleteChecklistItem({ id: other, role: 'user' }, item)
		).toThrow(/Only the person/);
	});
});

describe('a game Steam refuses', () => {
	it('is skipped without stopping the sync, and tried again next time', async () => {
		steam.owned.push(
			{ appId: 50, name: 'Refused', playtimeMinutes: 10, lastPlayedAt: null, hasStats: true },
			{ appId: 60, name: 'Fine', playtimeMinutes: 10, lastPlayedAt: null, hasStats: true }
		);
		steam.schema.set(50, ['R']);
		steam.schema.set(60, ['F1', 'F2']);
		steam.unlocked.set(60, new Set(['F1']));
		steam.refused.add(50);

		const message = await sync.fullSync(userId);
		expect(message).toContain("1 game Steam didn't answer for");
		expect(library.progressFor(userId, gameId(60))).toEqual({ unlocked: 1, total: 2 });
		const user = getDb().select().from(schema.users).where(eq(schema.users.id, userId)).get()!;
		expect(user.steamSync.status).toBe('idle');
		// Settings lists it, with Steam's own words.
		expect(user.steamSync.skipped).toEqual([
			{ gameId: gameId(50), name: 'Refused', reason: 'Steam answered 403: Profile is not public' }
		]);

		steam.refused.clear();
		await sync.fullSync(userId);
		expect(entry(50).achievementsSyncedAt).toBeInstanceOf(Date);
		const after = getDb().select().from(schema.users).where(eq(schema.users.id, userId)).get()!;
		expect(after.steamSync.skipped).toEqual([]);
	});
});

describe('unlinking', () => {
	it('keeps the library and allows ticking by hand', () => {
		sync.unlinkSteam(userId);
		const user = getDb().select().from(schema.users).where(eq(schema.users.id, userId)).get()!;
		expect(user.steamId).toBeNull();
		expect(entry(10).steamOwned).toBe(false);
		expect(library.listLibrary(userId).length).toBe(6);
	});
});

describe('IGDB games', () => {
	it('fold into the Steam game when IGDB knows its app', () => {
		const id = gamesService.ensureIgdbGame({
			igdbId: 999,
			name: 'Elden Ring',
			cover: null,
			hero: null,
			summary: 'From IGDB',
			releaseDate: '2022-02-25',
			developers: ['FromSoftware'],
			genres: [],
			platforms: ['PS5'],
			steamAppId: 10
		});
		expect(id).toBe(gameId(10));
		expect(gamesService.getGame(id)).toMatchObject({ igdbId: 999, developers: ['FromSoftware'] });
	});
});
