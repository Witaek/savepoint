import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
	prefixOf,
	ruleMatches,
	splitFileSchema,
	suggestPrefixes
} from '../../src/lib/server/services/split-rules';

const a = (key: string, sortOrder: number, name = key, description: string | null = null) => ({
	key,
	name,
	description,
	sortOrder
});

describe('rules', () => {
	it('match API-name prefixes, any case', () => {
		const rule = { type: 'prefix' as const, value: 'kh1_', rangeFrom: null, rangeTo: null };
		expect(ruleMatches(rule, a('KH1_003', 0))).toBe(true);
		expect(ruleMatches(rule, a('KH2_003', 0))).toBe(false);
	});
	it('match positions in Steam order, counted from 1, ends included', () => {
		const rule = { type: 'range' as const, value: '', rangeFrom: 2, rangeTo: 3 };
		expect([0, 1, 2, 3].map((i) => ruleMatches(rule, a('X', i)))).toEqual([
			false,
			true,
			true,
			false
		]);
	});
	it('match a word in the name or description', () => {
		const rule = { type: 'contains' as const, value: 'aqua', rangeFrom: null, rangeTo: null };
		expect(ruleMatches(rule, a('A', 0, 'The Warrior: Aqua'))).toBe(true);
		expect(ruleMatches(rule, a('B', 0, 'Seeker', "Finish Aqua's story"))).toBe(true);
		expect(ruleMatches(rule, a('C', 0, 'Seeker'))).toBe(false);
	});
});

describe('prefix suggestions', () => {
	it('read prefixes from API names', () => {
		expect(prefixOf('KH1_003')).toBe('KH1_');
		expect(prefixOf('bbs_final')).toBe('BBS_');
		expect(prefixOf('ACH12')).toBe('ACH');
		expect(prefixOf('SECRET')).toBeNull();
	});

	it('find the games of a collection, in Steam order', () => {
		const keys = [
			...Array.from({ length: 5 }, (_, i) => `KH1_${i}`),
			...Array.from({ length: 4 }, (_, i) => `COM_${i}`),
			...Array.from({ length: 6 }, (_, i) => `KH2_${i}`),
			'META_ALL'
		];
		expect(suggestPrefixes(keys.map((k, i) => a(k, i)))).toEqual([
			{ prefix: 'KH1_', count: 5, first: 1 },
			{ prefix: 'COM_', count: 4, first: 6 },
			{ prefix: 'KH2_', count: 6, first: 10 }
		]);
	});

	it('suggest nothing when names share one prefix or follow no pattern', () => {
		expect(suggestPrefixes(Array.from({ length: 30 }, (_, i) => a(`ACH_${i}`, i)))).toEqual([]);
		expect(suggestPrefixes(['A', 'B', 'C', 'D'].map((k, i) => a(k, i)))).toEqual([]);
	});
});

describe('split files', () => {
	it('accept the documented format and fill defaults', () => {
		const file = splitFileSchema.parse({
			format: 1,
			groups: [{ name: 'Kingdom Hearts II', rules: [{ type: 'range', from: 1, to: 9 }] }]
		});
		expect(file.groups[0]).toEqual({
			name: 'Kingdom Hearts II',
			kind: 'game',
			rules: [{ type: 'range', from: 1, to: 9 }],
			achievements: []
		});
	});
	it('refuse anything else', () => {
		expect(splitFileSchema.safeParse({ format: 2, groups: [] }).success).toBe(false);
		expect(
			splitFileSchema.safeParse({ format: 1, groups: [{ name: 'X', rules: [{ type: 'regex' }] }] })
				.success
		).toBe(false);
	});
});

// ---------- With a database ----------

const dataDir = mkdtempSync(join(tmpdir(), 'savepoint-splits-'));
process.env.DATA_DIR = dataDir;
const { runMigrations, closeDb, getDb } = await import('../../src/lib/server/db/client');
const schema = await import('../../src/lib/server/db/schema');
const splits = await import('../../src/lib/server/services/splits');
const { createUser } = await import('../../src/lib/server/auth');
const { addChecklistItem } = await import('../../src/lib/server/services/achievements');
const { eq, asc } = await import('drizzle-orm');

let gameId: number;
const KEYS = ['KH1_A', 'KH1_B', 'KH1_C', 'KH2_A', 'KH2_B', 'KH2_C', 'BBS_AQUA', 'META'];

function groupOfEach(id = gameId): Record<string, string | null> {
	const groups = new Map(splits.groupsOf(id).map((g) => [g.id, g.name] as const));
	return Object.fromEntries(
		getDb()
			.select()
			.from(schema.achievements)
			.where(eq(schema.achievements.gameId, id))
			.orderBy(asc(schema.achievements.sortOrder))
			.all()
			.filter((x) => x.source === 'steam')
			.map((x) => [x.key, x.groupId ? (groups.get(x.groupId) ?? '?') : null])
	);
}

function makeGame(appId: number): number {
	const db = getDb();
	const { id } = db
		.insert(schema.games)
		.values({ steamAppId: appId, name: `Collection ${appId}` })
		.returning({ id: schema.games.id })
		.get();
	KEYS.forEach((key, i) =>
		db
			.insert(schema.achievements)
			.values({
				gameId: id,
				key,
				source: 'steam',
				name: key === 'BBS_AQUA' ? 'The Warrior: Aqua' : key,
				sortOrder: i
			})
			.run()
	);
	return id;
}

beforeAll(() => {
	runMigrations();
	gameId = makeGame(2552430);
});
afterAll(() => {
	closeDb();
	rmSync(dataDir, { recursive: true, force: true });
});

describe('splitting a game', () => {
	it('puts achievements in groups by the first rule that matches', () => {
		const kh1 = splits.createGroup(gameId, 'Kingdom Hearts');
		const kh2 = splits.createGroup(gameId, 'Kingdom Hearts II');
		const bbs = splits.createGroup(gameId, 'Birth by Sleep');
		splits.addRule(gameId, { groupId: kh1, type: 'prefix', value: 'KH1_' });
		splits.addRule(gameId, { groupId: bbs, type: 'contains', value: 'aqua' });
		// Positions 4–7 would also catch BBS_AQUA, but the rule above comes first.
		splits.addRule(gameId, { groupId: kh2, type: 'range', from: 4, to: 7 });
		expect(groupOfEach()).toEqual({
			KH1_A: 'Kingdom Hearts',
			KH1_B: 'Kingdom Hearts',
			KH1_C: 'Kingdom Hearts',
			KH2_A: 'Kingdom Hearts II',
			KH2_B: 'Kingdom Hearts II',
			KH2_C: 'Kingdom Hearts II',
			BBS_AQUA: 'Birth by Sleep',
			META: null
		});
	});

	it('keeps achievements moved by hand where they were put, until sent back to the rules', () => {
		const [kh1] = splits.groupsOf(gameId);
		const meta = getDb()
			.select()
			.from(schema.achievements)
			.all()
			.find((x) => x.key === 'META')!;
		const kh2a = getDb()
			.select()
			.from(schema.achievements)
			.all()
			.find((x) => x.key === 'KH2_A')!;
		splits.assignAchievements(gameId, [meta.id, kh2a.id], kh1.id);
		splits.applySplit(gameId);
		expect(groupOfEach()).toMatchObject({ META: 'Kingdom Hearts', KH2_A: 'Kingdom Hearts' });
		splits.assignAchievements(gameId, [kh2a.id], 'rules');
		expect(groupOfEach()).toMatchObject({ META: 'Kingdom Hearts', KH2_A: 'Kingdom Hearts II' });
	});

	it('refuses rules that would match nothing', () => {
		const [g] = splits.groupsOf(gameId);
		expect(() => splits.addRule(gameId, { groupId: g.id, type: 'range', from: 9, to: 3 })).toThrow(
			/range/
		);
		expect(() => splits.addRule(gameId, { groupId: g.id, type: 'prefix', value: ' ' })).toThrow();
	});

	it('sends the achievements of a deleted group back to the rules', () => {
		const bbs = splits.groupsOf(gameId).find((g) => g.name === 'Birth by Sleep')!;
		splits.deleteGroup(gameId, bbs.id);
		// Its rule went with it, so BBS_AQUA falls to the range rule.
		expect(groupOfEach()).toMatchObject({ BBS_AQUA: 'Kingdom Hearts II' });
	});

	it('moves groups up and down', () => {
		const [first, second] = splits.groupsOf(gameId);
		splits.moveGroup(gameId, second.id, -1);
		expect(
			splits
				.groupsOf(gameId)
				.map((g) => g.id)
				.slice(0, 2)
		).toEqual([second.id, first.id]);
	});

	it('exports a split that another server (or game) imports the same', () => {
		const file = splits.exportSplit(gameId, { steamAppId: 2552430 });
		expect(splitFileSchema.safeParse(file).success).toBe(true);
		const other = makeGame(999);
		splits.importSplit(other, JSON.parse(JSON.stringify(file)));
		expect(groupOfEach(other)).toEqual(groupOfEach());
		expect(() => splits.importSplit(other, { format: 1, groups: [] })).toThrow(/split file/);
	});

	it('suggests groups from API-name prefixes', async () => {
		const suggestion = await splits.suggest(gameId, null);
		expect(suggestion.prefixes.map((p) => p.prefix)).toEqual(['KH1_', 'KH2_']);
	});

	it('files a checklist item under the game it was added in', async () => {
		const userId = await createUser({ username: 'sora', password: 'password123', role: 'user' });
		const [group] = splits.groupsOf(gameId);
		const id = addChecklistItem(userId, gameId, { name: 'All Dalmatians', groupId: group.id });
		const item = getDb()
			.select()
			.from(schema.achievements)
			.where(eq(schema.achievements.id, id))
			.get()!;
		expect(item).toMatchObject({ groupId: group.id, groupManual: true });
	});

	it('clears a split', () => {
		splits.clearSplit(gameId);
		expect(splits.groupsOf(gameId)).toEqual([]);
		expect(Object.values(groupOfEach()).every((g) => g === null)).toBe(true);
	});
});
