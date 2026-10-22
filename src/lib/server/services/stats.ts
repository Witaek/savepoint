import { and, count, eq, gte, sql } from 'drizzle-orm';
import { isPerfect, percent } from '$lib/games';
import { getDb } from '../db/client';
import { userAchievements } from '../db/schema';
import { listLibrary, type LibraryItem } from './library';

export interface Summary {
	perfected: number;
	/** Average completion of games with at least one unlock (Steam's "average completion rate"). */
	averageCompletion: number;
	unlocks: number;
	backlog: number;
	unsorted: number;
	games: number;
	playtimeMinutes: number;
}

export function summarize(items: LibraryItem[], unlocks: number): Summary {
	const owned = items.filter((i) => i.entry.status !== 'wishlist');
	const started = owned.filter((i) => i.progress.total > 0 && i.progress.unlocked > 0);
	return {
		perfected: owned.filter((i) => isPerfect(i.progress)).length,
		averageCompletion: started.length
			? Math.round(started.reduce((sum, i) => sum + percent(i.progress), 0) / started.length)
			: 0,
		unlocks,
		backlog: owned.filter((i) => i.entry.status === 'backlog').length,
		unsorted: owned.filter((i) => i.entry.status === 'unsorted').length,
		games: owned.length,
		playtimeMinutes: owned.reduce((sum, i) => sum + i.entry.playtimeMinutes, 0)
	};
}

export function unlockCount(userId: number): number {
	return (
		getDb()
			.select({ n: count() })
			.from(userAchievements)
			.where(eq(userAchievements.userId, userId))
			.get()?.n ?? 0
	);
}

/** Unlocks per month for the last 12 months, oldest first ("2026-03"). */
export function unlocksByMonth(
	userId: number,
	now = new Date()
): { month: string; count: number }[] {
	const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
	const rows = getDb()
		.select({
			month: sql<string>`strftime('%Y-%m', ${userAchievements.unlockedAt} / 1000, 'unixepoch', 'localtime')`,
			n: count()
		})
		.from(userAchievements)
		.where(and(eq(userAchievements.userId, userId), gte(userAchievements.unlockedAt, start)))
		.groupBy(sql`1`)
		.all();
	const byMonth = new Map(rows.map((r) => [r.month, r.n]));
	return Array.from({ length: 12 }, (_, i) => {
		const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
		const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
		return { month, count: byMonth.get(month) ?? 0 };
	});
}

export function overview(userId: number) {
	const items = listLibrary(userId);
	return { items, summary: summarize(items, unlockCount(userId)) };
}
