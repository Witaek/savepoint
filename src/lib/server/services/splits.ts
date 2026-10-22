import { and, asc, eq, inArray, max } from 'drizzle-orm';
import { DAY, cached } from '../cache';
import { config } from '../config';
import { getDb } from '../db/client';
import {
	achievementGroups,
	achievements,
	splitRules,
	type AchievementGroupRow,
	type GroupKind,
	type SplitRuleRow,
	type SplitRuleType
} from '../db/schema';
import { bundleContents } from '../providers/igdb';
import {
	fromRuleRow,
	groupFor,
	splitFileSchema,
	suggestPrefixes,
	toRuleRow,
	type PrefixSuggestion,
	type SplitFile
} from './split-rules';

/**
 * Splitting a game into groups with their own progress: the games of a collection sold as one
 * Steam app (Kingdom Hearts 1.5+2.5), or DLC. Steam has one list per app and says nothing about
 * which game or DLC an achievement belongs to, so the split is made here:
 *
 * - rules put Steam achievements in groups, in order (first match wins): API-name prefix, Steam
 *   order range, or a word in the name or description;
 * - achievements moved by hand stay where they were put (`group_manual`);
 * - a split can be exported as a small JSON file, imported, and shipped with Savepoint
 *   (`src/lib/server/splits/<steam app id>.json`), so a known collection splits itself.
 *
 * Groups are shared by everyone on the server, like the game.
 */

export class SplitError extends Error {}

// Split files shipped with Savepoint, by Steam app id.
const shipped = new Map<number, SplitFile>();
for (const [path, file] of Object.entries(
	import.meta.glob('../splits/*.json', { eager: true, import: 'default' })
)) {
	const parsed = splitFileSchema.safeParse(file);
	const appId = Number(path.match(/(\d+)\.json$/)?.[1]);
	if (parsed.success && appId) shipped.set(appId, parsed.data);
	else console.warn(`[splits] ignoring ${path}: not a valid split file`);
}

export const shippedSplit = (steamAppId: number) => shipped.get(steamAppId) ?? null;

export function groupsOf(gameId: number): AchievementGroupRow[] {
	return getDb()
		.select()
		.from(achievementGroups)
		.where(eq(achievementGroups.gameId, gameId))
		.orderBy(asc(achievementGroups.sortOrder), asc(achievementGroups.id))
		.all();
}

export function rulesOf(gameId: number): SplitRuleRow[] {
	return getDb()
		.select()
		.from(splitRules)
		.where(eq(splitRules.gameId, gameId))
		.orderBy(asc(splitRules.sortOrder), asc(splitRules.id))
		.all();
}

function ownGroup(gameId: number, groupId: number): AchievementGroupRow {
	const group = getDb()
		.select()
		.from(achievementGroups)
		.where(and(eq(achievementGroups.id, groupId), eq(achievementGroups.gameId, gameId)))
		.get();
	if (!group) throw new SplitError('That group is no longer there.');
	return group;
}

/**
 * Re-applies the rules to the Steam achievements not placed by hand. Run after any change to
 * the rules or groups, and when Steam's list changes.
 */
export function applySplit(gameId: number): void {
	const db = getDb();
	const rules = rulesOf(gameId);
	const list = db
		.select()
		.from(achievements)
		.where(and(eq(achievements.gameId, gameId), eq(achievements.source, 'steam')))
		.all();
	db.transaction((tx) => {
		for (const a of list) {
			if (a.groupManual) continue;
			const groupId = groupFor(rules, a);
			if (groupId !== a.groupId) {
				tx.update(achievements).set({ groupId }).where(eq(achievements.id, a.id)).run();
			}
		}
	});
}

// ---------- Groups ----------

function nextOrder(table: typeof achievementGroups | typeof splitRules, gameId: number): number {
	const row = getDb()
		.select({ n: max(table.sortOrder) })
		.from(table)
		.where(eq(table.gameId, gameId))
		.get();
	return (row?.n ?? -1) + 1;
}

const cleanName = (name: string) => {
	const value = name.trim().replace(/\s+/g, ' ');
	if (!value) throw new SplitError('Give the group a name.');
	if (value.length > 120) throw new SplitError('Keep the name under 120 characters.');
	return value;
};

export function createGroup(gameId: number, name: string, kind: GroupKind = 'game'): number {
	const { id } = getDb()
		.insert(achievementGroups)
		.values({
			gameId,
			name: cleanName(name),
			kind,
			sortOrder: nextOrder(achievementGroups, gameId)
		})
		.returning({ id: achievementGroups.id })
		.get();
	return id;
}

export function updateGroup(
	gameId: number,
	groupId: number,
	values: { name?: string; kind?: GroupKind }
): void {
	ownGroup(gameId, groupId);
	getDb()
		.update(achievementGroups)
		.set({
			...(values.name !== undefined ? { name: cleanName(values.name) } : {}),
			...(values.kind ? { kind: values.kind } : {})
		})
		.where(eq(achievementGroups.id, groupId))
		.run();
}

/** Moves a group up or down among the game's groups. */
export function moveGroup(gameId: number, groupId: number, direction: -1 | 1): void {
	const groups = groupsOf(gameId);
	const index = groups.findIndex((g) => g.id === groupId);
	const other = groups[index + direction];
	if (index < 0 || !other) return;
	const db = getDb();
	db.transaction((tx) => {
		groups.forEach((g, i) => {
			const order = g.id === groupId ? i + direction : g.id === other.id ? index : i;
			tx.update(achievementGroups)
				.set({ sortOrder: order })
				.where(eq(achievementGroups.id, g.id))
				.run();
		});
	});
}

export function deleteGroup(gameId: number, groupId: number): void {
	ownGroup(gameId, groupId);
	const db = getDb();
	db.transaction((tx) => {
		// Its achievements go back to the rules (the column can't clear itself in SQLite).
		tx.update(achievements)
			.set({ groupId: null, groupManual: false })
			.where(eq(achievements.groupId, groupId))
			.run();
		tx.delete(achievementGroups).where(eq(achievementGroups.id, groupId)).run();
	});
	applySplit(gameId);
}

// ---------- Rules ----------

export interface RuleInput {
	groupId: number;
	type: SplitRuleType;
	value?: string;
	from?: number;
	to?: number;
}

export function addRule(gameId: number, input: RuleInput): void {
	ownGroup(gameId, input.groupId);
	const value = (input.value ?? '').trim();
	if (input.type === 'range') {
		const { from, to } = input;
		if (!from || !to || from < 1 || to < from) {
			throw new SplitError('Enter a range like 1 to 56 (positions in Steam’s list).');
		}
	} else if (!value) {
		throw new SplitError(
			input.type === 'prefix' ? 'Enter the start of the API names.' : 'Enter a word to look for.'
		);
	}
	getDb()
		.insert(splitRules)
		.values({
			gameId,
			groupId: input.groupId,
			type: input.type,
			value: input.type === 'range' ? '' : value,
			rangeFrom: input.type === 'range' ? input.from! : null,
			rangeTo: input.type === 'range' ? input.to! : null,
			sortOrder: nextOrder(splitRules, gameId)
		})
		.run();
	applySplit(gameId);
}

export function deleteRule(gameId: number, ruleId: number): void {
	getDb()
		.delete(splitRules)
		.where(and(eq(splitRules.id, ruleId), eq(splitRules.gameId, gameId)))
		.run();
	applySplit(gameId);
}

// ---------- Moving achievements by hand ----------

/**
 * Puts achievements in a group by hand (rules then leave them there), or with `groupId: null`
 * back under the rules.
 */
export function assignAchievements(
	gameId: number,
	achievementIds: number[],
	groupId: number | 'rules' | 'none'
): void {
	if (achievementIds.length === 0) return;
	if (typeof groupId === 'number') ownGroup(gameId, groupId);
	const where = and(eq(achievements.gameId, gameId), inArray(achievements.id, achievementIds));
	const db = getDb();
	if (groupId === 'rules') {
		db.update(achievements).set({ groupManual: false }).where(where).run();
		applySplit(gameId);
		return;
	}
	db.update(achievements)
		.set({ groupId: groupId === 'none' ? null : groupId, groupManual: true })
		.where(where)
		.run();
}

// ---------- Suggestions ----------

export interface Suggestion {
	prefixes: PrefixSuggestion[];
	/** Names of the games in the bundle, from IGDB, to name the groups with. */
	names: string[];
}

export async function suggest(gameId: number, steamAppId: number | null): Promise<Suggestion> {
	const list = getDb()
		.select()
		.from(achievements)
		.where(and(eq(achievements.gameId, gameId), eq(achievements.source, 'steam')))
		.all();
	let names: string[] = [];
	if (steamAppId && config().igdbConfigured) {
		names = await cached(`igdb:bundle:${steamAppId}`, 30 * DAY, () =>
			bundleContents(steamAppId)
		).catch(() => []);
	}
	return { prefixes: suggestPrefixes(list), names };
}

/** Creates one group per suggested prefix (named as given), each with its prefix rule. */
export function applyPrefixSuggestion(
	gameId: number,
	choices: { prefix: string; name: string }[]
): void {
	for (const choice of choices) {
		if (!choice.name.trim()) continue;
		const groupId = createGroup(gameId, choice.name);
		addRule(gameId, { groupId, type: 'prefix', value: choice.prefix });
	}
}

// ---------- Split files ----------

export function exportSplit(
	gameId: number,
	meta: { steamAppId?: number | null; name?: string }
): SplitFile {
	const groups = groupsOf(gameId);
	const rules = rulesOf(gameId);
	const manual = getDb()
		.select({ key: achievements.key, groupId: achievements.groupId })
		.from(achievements)
		.where(
			and(
				eq(achievements.gameId, gameId),
				eq(achievements.source, 'steam'),
				eq(achievements.groupManual, true)
			)
		)
		.all();
	return {
		format: 1,
		...(meta.steamAppId ? { steamAppId: meta.steamAppId } : {}),
		...(meta.name ? { name: meta.name } : {}),
		groups: groups.map((g) => ({
			name: g.name,
			kind: g.kind,
			rules: rules.filter((r) => r.groupId === g.id).map(fromRuleRow),
			achievements: manual.filter((m) => m.groupId === g.id).map((m) => m.key)
		}))
	};
}

/**
 * Replaces a game's split with the one in a file. Rules keep the order they have in the file,
 * group by group.
 */
export function importSplit(gameId: number, input: unknown): void {
	const parsed = splitFileSchema.safeParse(input);
	if (!parsed.success) {
		throw new SplitError(
			`That isn't a Savepoint split file: ${parsed.error.issues[0]?.message ?? 'unknown format'}.`
		);
	}
	const file = parsed.data;
	const db = getDb();
	db.transaction((tx) => {
		tx.update(achievements)
			.set({ groupId: null, groupManual: false })
			.where(eq(achievements.gameId, gameId))
			.run();
		tx.delete(splitRules).where(eq(splitRules.gameId, gameId)).run();
		tx.delete(achievementGroups).where(eq(achievementGroups.gameId, gameId)).run();
		const keys = new Map(
			tx
				.select({ id: achievements.id, key: achievements.key })
				.from(achievements)
				.where(and(eq(achievements.gameId, gameId), eq(achievements.source, 'steam')))
				.all()
				.map((a) => [a.key, a.id] as const)
		);
		let ruleOrder = 0;
		file.groups.forEach((group, groupOrder) => {
			const { id: groupId } = tx
				.insert(achievementGroups)
				.values({ gameId, name: group.name, kind: group.kind, sortOrder: groupOrder })
				.returning({ id: achievementGroups.id })
				.get();
			for (const rule of group.rules) {
				tx.insert(splitRules)
					.values({ gameId, groupId, ...toRuleRow(rule), sortOrder: ruleOrder++ })
					.run();
			}
			const ids = group.achievements.map((k) => keys.get(k)).filter((id) => id !== undefined);
			if (ids.length) {
				tx.update(achievements)
					.set({ groupId, groupManual: true })
					.where(inArray(achievements.id, ids))
					.run();
			}
		});
	});
	applySplit(gameId);
}

/**
 * After Steam's list of a game was read: a known collection gets its shipped split the first
 * time, and new achievements are put in groups by the existing rules.
 */
export function refreshSplit(gameId: number, steamAppId: number): void {
	const file = shippedSplit(steamAppId);
	if (file && groupsOf(gameId).length === 0) importSplit(gameId, file);
	else applySplit(gameId);
}

/** Removes a game's split entirely. */
export function clearSplit(gameId: number): void {
	const db = getDb();
	db.transaction((tx) => {
		tx.update(achievements)
			.set({ groupId: null, groupManual: false })
			.where(eq(achievements.gameId, gameId))
			.run();
		tx.delete(splitRules).where(eq(splitRules.gameId, gameId)).run();
		tx.delete(achievementGroups).where(eq(achievementGroups.gameId, gameId)).run();
	});
}
