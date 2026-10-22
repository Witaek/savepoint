import { randomBytes } from 'node:crypto';
import { and, asc, desc, eq, max, sql, type SQL } from 'drizzle-orm';
import { getDb } from '../db/client';
import { achievements, games, userAchievements, type AchievementRow } from '../db/schema';
import { getEntry, recheckPerfection, updatePerfection } from './library';

export class AchievementError extends Error {}

export interface AchievementView extends AchievementRow {
	unlockedAt: Date | null;
	unlockSource: 'steam' | 'manual' | null;
}

/** A game's achievements with one person's unlocks, in Steam's order, then checklist items. */
export function achievementsFor(userId: number, gameId: number): AchievementView[] {
	return getDb()
		.select({
			achievement: achievements,
			unlockedAt: userAchievements.unlockedAt,
			unlockSource: userAchievements.source
		})
		.from(achievements)
		.leftJoin(
			userAchievements,
			and(eq(userAchievements.achievementId, achievements.id), eq(userAchievements.userId, userId))
		)
		.where(eq(achievements.gameId, gameId))
		.orderBy(
			desc(sql`${achievements.source} = 'steam'`),
			asc(achievements.sortOrder),
			asc(achievements.id)
		)
		.all()
		.map((r) => ({
			...r.achievement,
			unlockedAt: r.unlockedAt,
			unlockSource: r.unlockSource
		}));
}

/**
 * Steam achievements of a game owned on the linked Steam account come from Steam and can't be
 * ticked by hand. Everything else can: checklist items, and Steam's list for a copy played on
 * another platform.
 */
export function canTick(achievement: AchievementRow, steamOwned: boolean): boolean {
	return achievement.source === 'custom' || !steamOwned;
}

export function setUnlocked(
	userId: number,
	achievementId: number,
	unlocked: boolean
): { perfected: boolean } {
	const db = getDb();
	const achievement = db
		.select()
		.from(achievements)
		.where(eq(achievements.id, achievementId))
		.get();
	if (!achievement) throw new AchievementError('That achievement no longer exists.');
	const entry = getEntry(userId, achievement.gameId);
	if (!entry) throw new AchievementError('Add the game to your library first.');
	if (!canTick(achievement, entry.steamOwned)) {
		throw new AchievementError('This one comes from Steam and updates on its own.');
	}
	if (unlocked) {
		db.insert(userAchievements)
			.values({ userId, achievementId, unlockedAt: new Date(), source: 'manual' })
			.onConflictDoNothing()
			.run();
	} else {
		db.delete(userAchievements)
			.where(
				and(eq(userAchievements.userId, userId), eq(userAchievements.achievementId, achievementId))
			)
			.run();
	}
	return { perfected: updatePerfection(userId, achievement.gameId) };
}

/** Adds a checklist item to a game. It is shared: everyone with the game sees it. */
export function addChecklistItem(
	userId: number,
	gameId: number,
	input: { name: string; description?: string | null }
): number {
	const name = input.name.trim();
	if (!name) throw new AchievementError('Give the item a name.');
	if (name.length > 120) throw new AchievementError('Keep the name under 120 characters.');
	const db = getDb();
	const last = db
		.select({ n: max(achievements.sortOrder) })
		.from(achievements)
		.where(and(eq(achievements.gameId, gameId), eq(achievements.source, 'custom')))
		.get();
	const { id } = db
		.insert(achievements)
		.values({
			gameId,
			key: `custom-${randomBytes(6).toString('hex')}`,
			source: 'custom',
			name,
			description: input.description?.trim() || null,
			sortOrder: (last?.n ?? -1) + 1,
			createdBy: userId
		})
		.returning({ id: achievements.id })
		.get();
	// A new item takes the game off 100% for everyone who had it perfected.
	recheckPerfection(gameId);
	return id;
}

export function deleteChecklistItem(
	user: { id: number; role: 'admin' | 'user' },
	achievementId: number
): number {
	const db = getDb();
	const item = db.select().from(achievements).where(eq(achievements.id, achievementId)).get();
	if (!item || item.source !== 'custom')
		throw new AchievementError('Only checklist items can be removed.');
	if (item.createdBy !== user.id && user.role !== 'admin') {
		throw new AchievementError('Only the person who added it (or an admin) can remove it.');
	}
	db.delete(achievements).where(eq(achievements.id, achievementId)).run();
	recheckPerfection(item.gameId);
	return item.gameId;
}

export interface UnlockView {
	achievementId: number;
	name: string;
	description: string | null;
	icon: string | null;
	globalPercent: number | null;
	unlockedAt: Date;
	gameId: number;
	gameName: string;
}

function unlockQuery(userId: number, extra?: SQL) {
	return getDb()
		.select({
			achievementId: achievements.id,
			name: achievements.name,
			description: achievements.description,
			icon: achievements.icon,
			globalPercent: achievements.globalPercent,
			unlockedAt: userAchievements.unlockedAt,
			gameId: games.id,
			gameName: games.name
		})
		.from(userAchievements)
		.innerJoin(achievements, eq(achievements.id, userAchievements.achievementId))
		.innerJoin(games, eq(games.id, achievements.gameId))
		.where(and(eq(userAchievements.userId, userId), extra))
		.$dynamic();
}

export function recentUnlocks(userId: number, limit = 8): UnlockView[] {
	return unlockQuery(userId).orderBy(desc(userAchievements.unlockedAt)).limit(limit).all();
}

export function rarestUnlocks(userId: number, limit = 10): UnlockView[] {
	return unlockQuery(userId, sql`${achievements.globalPercent} is not null`)
		.orderBy(asc(achievements.globalPercent))
		.limit(limit)
		.all();
}
