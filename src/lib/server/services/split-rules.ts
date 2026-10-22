import { z } from 'zod';
import type { GroupKind, SplitRuleType } from '../db/schema';

/**
 * The pure part of splitting a game into groups: which rule matches an achievement, which
 * API-name prefixes look like separate games, and the shareable split file. No database here.
 */

export interface RuleLike {
	type: SplitRuleType;
	value: string;
	rangeFrom: number | null;
	rangeTo: number | null;
}

export interface AchievementLike {
	key: string;
	name: string;
	description: string | null;
	/** Position in Steam's list, 0-based. Rules count from 1, as people do. */
	sortOrder: number;
}

export function ruleMatches(rule: RuleLike, a: AchievementLike): boolean {
	switch (rule.type) {
		case 'prefix':
			return rule.value !== '' && a.key.toLowerCase().startsWith(rule.value.toLowerCase());
		case 'range': {
			const position = a.sortOrder + 1;
			return (
				rule.rangeFrom !== null &&
				rule.rangeTo !== null &&
				position >= rule.rangeFrom &&
				position <= rule.rangeTo
			);
		}
		case 'contains': {
			const needle = rule.value.trim().toLowerCase();
			if (!needle) return false;
			return `${a.name}\n${a.description ?? ''}`.toLowerCase().includes(needle);
		}
	}
}

/** The group of the first rule that matches, or null. */
export function groupFor<R extends RuleLike & { groupId: number }>(
	rules: R[],
	a: AchievementLike
): number | null {
	return rules.find((r) => ruleMatches(r, a))?.groupId ?? null;
}

export function describeRule(rule: RuleLike): string {
	switch (rule.type) {
		case 'prefix':
			return `API name starts with ${rule.value}`;
		case 'range':
			return `Steam order ${rule.rangeFrom}–${rule.rangeTo}`;
		case 'contains':
			return `Name or description contains "${rule.value}"`;
	}
}

/**
 * "KH1_003" → "KH1_", "BBS_FINAL" → "BBS_", "ACH12" → "ACH". Publishers often prefix API names per
 * game in a collection; the prefix is the first part before an underscore, else the letters
 * before trailing digits.
 */
export function prefixOf(key: string): string | null {
	const underscore = key.indexOf('_');
	if (underscore > 0) return key.slice(0, underscore + 1).toUpperCase();
	const letters = key.match(/^([A-Za-z]+)\d+$/)?.[1];
	return letters ? letters.toUpperCase() : null;
}

export interface PrefixSuggestion {
	prefix: string;
	count: number;
	/** Position of its first achievement in Steam's list (1-based), to keep Steam's order. */
	first: number;
}

/**
 * API-name prefixes that look like separate games: at least two prefixes with 3+ achievements
 * each, covering most of the list. Empty when the names don't follow such a pattern (then a
 * split is made with Steam's order or by hand).
 */
export function suggestPrefixes(achievements: AchievementLike[]): PrefixSuggestion[] {
	const groups = new Map<string, PrefixSuggestion>();
	for (const a of achievements) {
		const prefix = prefixOf(a.key);
		if (!prefix) continue;
		const g = groups.get(prefix) ?? { prefix, count: 0, first: a.sortOrder + 1 };
		g.count++;
		g.first = Math.min(g.first, a.sortOrder + 1);
		groups.set(prefix, g);
	}
	const big = [...groups.values()].filter((g) => g.count >= 3);
	const covered = big.reduce((n, g) => n + g.count, 0);
	if (big.length < 2 || covered < achievements.length * 0.6) return [];
	return big.sort((a, b) => a.first - b.first);
}

// ---------- The split file (export, import, shipped splits) ----------

const ruleSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('prefix'), value: z.string().min(1).max(100) }),
	z.object({
		type: z.literal('range'),
		from: z.number().int().min(1),
		to: z.number().int().min(1)
	}),
	z.object({ type: z.literal('contains'), value: z.string().min(1).max(100) })
]);

export const splitFileSchema = z.object({
	format: z.literal(1),
	steamAppId: z.number().int().positive().optional(),
	name: z.string().optional(),
	groups: z
		.array(
			z.object({
				name: z.string().trim().min(1).max(120),
				kind: z.enum(['game', 'dlc']).default('game'),
				rules: z.array(ruleSchema).default([]),
				/** API names put in this group by hand. */
				achievements: z.array(z.string()).default([])
			})
		)
		.min(1)
		.max(40)
});

export type SplitFile = z.infer<typeof splitFileSchema>;
export type SplitFileRule = z.infer<typeof ruleSchema>;

export function toRuleRow(rule: SplitFileRule): RuleLike {
	return rule.type === 'range'
		? { type: 'range', value: '', rangeFrom: rule.from, rangeTo: rule.to }
		: { type: rule.type, value: rule.value, rangeFrom: null, rangeTo: null };
}

export function fromRuleRow(rule: RuleLike): SplitFileRule {
	return rule.type === 'range'
		? { type: 'range', from: rule.rangeFrom ?? 1, to: rule.rangeTo ?? 1 }
		: { type: rule.type, value: rule.value };
}

export type { GroupKind };
