import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm';
import { getDb } from '$lib/server/db/client';
import { achievements, userAchievements } from '$lib/server/db/schema';
import { perfectedGames, progressByGame } from '$lib/server/services/library';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const userId = locals.user!.id;
	const rows = perfectedGames(userId);
	const ids = rows.map((r) => r.game.id);
	const progress = progressByGame(userId, ids);

	// The rarest achievement of each perfected game: its trophy on the shelf.
	const rarest = new Map<number, { name: string; icon: string | null; globalPercent: number }>();
	if (ids.length) {
		const list = getDb()
			.select({
				gameId: achievements.gameId,
				name: achievements.name,
				icon: achievements.icon,
				globalPercent: achievements.globalPercent
			})
			.from(achievements)
			.innerJoin(
				userAchievements,
				and(
					eq(userAchievements.achievementId, achievements.id),
					eq(userAchievements.userId, userId)
				)
			)
			.where(and(inArray(achievements.gameId, ids), isNotNull(achievements.globalPercent)))
			.orderBy(asc(achievements.globalPercent))
			.all();
		for (const a of list)
			if (!rarest.has(a.gameId)) rarest.set(a.gameId, { ...a, globalPercent: a.globalPercent! });
	}

	return {
		games: rows.map((r) => ({
			game: r.game,
			perfectedAt: r.entry.perfectedAt!,
			playtimeMinutes: r.entry.playtimeMinutes,
			platform: r.entry.platform,
			progress: progress.get(r.game.id) ?? { unlocked: 0, total: 0 },
			rarest: rarest.get(r.game.id) ?? null
		}))
	};
};
