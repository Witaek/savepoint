import { isPerfect, percent } from '$lib/games';
import { rarestUnlocks } from '$lib/server/services/achievements';
import { overview, unlocksByMonth } from '$lib/server/services/stats';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const userId = locals.user!.id;
	const { items, summary } = overview(userId);
	const owned = items.filter((i) => i.entry.status !== 'wishlist');
	const withAchievements = owned.filter((i) => i.progress.total > 0);
	// How many games sit in each completion band.
	const bands = [
		{ label: '0%', test: (p: number) => p === 0 },
		{ label: '1–49%', test: (p: number) => p > 0 && p < 50 },
		{ label: '50–89%', test: (p: number) => p >= 50 && p < 90 },
		{ label: '90–99%', test: (p: number) => p >= 90 && p < 100 },
		{ label: '100%', test: (p: number) => p >= 100 }
	].map((b) => ({
		label: b.label,
		count: withAchievements.filter((i) => b.test(isPerfect(i.progress) ? 100 : percent(i.progress)))
			.length
	}));
	return {
		summary,
		months: unlocksByMonth(userId),
		rarest: rarestUnlocks(userId, 10),
		bands,
		mostPlayed: [...owned]
			.sort((a, b) => b.entry.playtimeMinutes - a.entry.playtimeMinutes)
			.slice(0, 8)
			.filter((i) => i.entry.playtimeMinutes > 0)
	};
};
