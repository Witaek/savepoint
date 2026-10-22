import { isPerfect, percent } from '$lib/games';
import { config } from '$lib/server/config';
import { getUser } from '$lib/server/services/account';
import { achievementsFor, recentUnlocks } from '$lib/server/services/achievements';
import { overview } from '$lib/server/services/stats';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const userId = locals.user!.id;
	const user = getUser(userId)!;
	const { items, summary } = overview(userId);

	// The game being played: most recently played among Playing, else the latest unlock's game.
	const playing = items
		.filter((i) => i.entry.status === 'playing')
		.sort(
			(a, b) =>
				(b.entry.lastPlayedAt?.getTime() ?? b.entry.updatedAt.getTime()) -
				(a.entry.lastPlayedAt?.getTime() ?? a.entry.updatedAt.getTime())
		);
	const recent = recentUnlocks(userId, 6);
	const current =
		playing[0] ?? items.find((i) => i.game.id === recent[0]?.gameId && !isPerfect(i.progress));

	// What's left, easiest first (most players have it).
	const remaining = current
		? achievementsFor(userId, current.game.id)
				.filter((a) => !a.unlockedAt)
				.sort((a, b) => (b.globalPercent ?? -1) - (a.globalPercent ?? -1))
		: [];

	const almostThere = items
		.filter(
			(i) =>
				i.game.id !== current?.game.id &&
				i.progress.total > 0 &&
				!isPerfect(i.progress) &&
				percent(i.progress) >= 50
		)
		.sort((a, b) => percent(b.progress) - percent(a.progress))
		.slice(0, 10);

	return {
		current: current && {
			...current,
			remaining: remaining.slice(0, 4),
			remainingCount: remaining.length
		},
		otherPlaying: playing.filter((i) => i.game.id !== current?.game.id).slice(0, 6),
		almostThere,
		recent,
		summary,
		steam: { configured: config().steamConfigured, linked: Boolean(user.steamId) },
		empty: items.length === 0
	};
};
