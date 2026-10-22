import { describe, expect, it } from 'vitest';
import { formatPlaytime, isPerfect, percent, rarity } from '../../src/lib/games';
import { relativeTime } from '../../src/lib/format';

describe('progress', () => {
	it('never rounds up to 100%', () => {
		expect(percent({ unlocked: 249, total: 250 })).toBe(99);
		expect(percent({ unlocked: 0, total: 0 })).toBe(0);
		expect(percent({ unlocked: 5, total: 5 })).toBe(100);
	});
	it('needs at least one achievement to be perfect', () => {
		expect(isPerfect({ unlocked: 0, total: 0 })).toBe(false);
		expect(isPerfect({ unlocked: 3, total: 3 })).toBe(true);
	});
});

describe('formatting', () => {
	it('formats playtime', () => {
		expect(formatPlaytime(0)).toBe('Not played');
		expect(formatPlaytime(45)).toBe('45 min');
		expect(formatPlaytime(90)).toBe('1.5 h');
		expect(formatPlaytime(120)).toBe('2 h');
		expect(formatPlaytime(8520)).toBe('142 h');
	});
	it('puts rarity in tiers', () => {
		expect(rarity(null)).toBeNull();
		expect(rarity(2)).toBe('ultra');
		expect(rarity(12)).toBe('rare');
		expect(rarity(30)).toBe('uncommon');
		expect(rarity(70)).toBe('common');
	});
	it('says how long ago', () => {
		const now = Date.parse('2026-10-22T12:00:00Z');
		expect(relativeTime(now - 30_000, now)).toBe('just now');
		expect(relativeTime(now - 5 * 60_000, now)).toBe('5 min ago');
		expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago');
		expect(relativeTime(now - 30 * 3_600_000, now)).toBe('yesterday');
		expect(relativeTime(0, now)).toBe('long ago');
	});
});
