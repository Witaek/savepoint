import { and, desc, eq, gt, isNotNull } from 'drizzle-orm';
import { getDb } from '../db/client';
import { games, libraryEntries, users, type UserPrefs } from '../db/schema';

const CELEBRATE_WITHIN = 14 * 24 * 60 * 60 * 1000;

export function getUser(userId: number) {
	return getDb().select().from(users).where(eq(users.id, userId)).get();
}

export function updatePrefs(userId: number, change: (prefs: UserPrefs) => UserPrefs): void {
	const user = getUser(userId);
	if (!user) return;
	getDb()
		.update(users)
		.set({ prefs: change(user.prefs) })
		.where(eq(users.id, userId))
		.run();
}

/**
 * A game perfected in the last two weeks that this person hasn't seen celebrated yet: shown
 * once, full screen, the next time they open the app.
 */
export function pendingCelebration(userId: number, prefs: UserPrefs) {
	if (prefs.celebrate === false) return null;
	const seen = new Set(prefs.celebrated ?? []);
	const recent = getDb()
		.select({
			gameId: games.id,
			name: games.name,
			hero: games.hero,
			perfectedAt: libraryEntries.perfectedAt
		})
		.from(libraryEntries)
		.innerJoin(games, eq(games.id, libraryEntries.gameId))
		.where(
			and(
				eq(libraryEntries.userId, userId),
				isNotNull(libraryEntries.perfectedAt),
				gt(libraryEntries.perfectedAt, new Date(Date.now() - CELEBRATE_WITHIN))
			)
		)
		.orderBy(desc(libraryEntries.perfectedAt))
		.all();
	return recent.find((g) => !seen.has(g.gameId)) ?? null;
}

export function markCelebrated(userId: number, gameId: number): void {
	updatePrefs(userId, (prefs) => ({
		...prefs,
		// The last 200 are plenty: older ones are outside the two-week window anyway.
		celebrated: [...new Set([gameId, ...(prefs.celebrated ?? [])])].slice(0, 200)
	}));
}
