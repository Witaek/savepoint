import { and, eq } from 'drizzle-orm';
import { config } from '../config';
import { getDb } from '../db/client';
import { notificationTargets } from '../db/schema';

/** Unlock notifications, sent to ntfy topics and Discord webhooks. */

export type NotificationTarget = typeof notificationTargets.$inferSelect;

export interface NotificationMessage {
	title: string;
	body: string;
	/** Page to open, e.g. /game/12. */
	path: string;
	/** A 100% gets the gold treatment. */
	perfect?: boolean;
}

const EMBER = 0xe3a54b;
const GOLD = 0xffd28a;

export function validateTargetUrl(type: 'ntfy' | 'discord', value: string): string | null {
	let url: URL;
	try {
		url = new URL(value.trim());
	} catch {
		return 'Enter a full address starting with https://';
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') return 'Use an http(s) address.';
	if (type === 'discord' && !/\/api\/webhooks\/\d+\/[\w-]+/.test(url.pathname)) {
		return 'That is not a Discord webhook URL (…/api/webhooks/…).';
	}
	if (type === 'ntfy' && url.pathname.replace(/\//g, '') === '') {
		return 'Add the topic to the address, e.g. https://ntfy.sh/my-savepoint.';
	}
	return null;
}

const absolute = (path: string) =>
	config().APP_URL ? new URL(path, config().APP_URL).href : undefined;

async function post(url: string, body: unknown): Promise<void> {
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(10_000)
	});
	if (!response.ok) {
		const text = await response.text().catch(() => '');
		throw new Error(`${response.status} ${text.slice(0, 120)}`.trim());
	}
}

export function deliver(target: NotificationTarget, message: NotificationMessage): Promise<void> {
	if (target.type === 'ntfy') {
		// JSON publishing (POST to the server root) keeps titles with accents intact.
		const topicUrl = new URL(target.url);
		return post(topicUrl.origin, {
			topic: topicUrl.pathname.replace(/^\/+|\/+$/g, ''),
			title: message.title,
			message: message.body,
			click: absolute(message.path),
			tags: [message.perfect ? 'trophy' : 'star'],
			priority: message.perfect ? 4 : 3
		});
	}
	return post(target.url, {
		username: 'Savepoint',
		embeds: [
			{
				title: message.title,
				description: message.body,
				url: absolute(message.path),
				color: message.perfect ? GOLD : EMBER
			}
		]
	});
}

/** Sends to one target and records the outcome. */
export async function sendToTarget(
	target: NotificationTarget,
	message: NotificationMessage
): Promise<boolean> {
	const db = getDb();
	try {
		await deliver(target, message);
		db.update(notificationTargets)
			.set({ lastSentAt: new Date(), lastError: null })
			.where(eq(notificationTargets.id, target.id))
			.run();
		return true;
	} catch (error) {
		db.update(notificationTargets)
			.set({ lastError: error instanceof Error ? error.message : String(error) })
			.where(eq(notificationTargets.id, target.id))
			.run();
		return false;
	}
}

export async function notifyUser(userId: number, message: NotificationMessage): Promise<void> {
	const targets = getDb()
		.select()
		.from(notificationTargets)
		.where(and(eq(notificationTargets.userId, userId), eq(notificationTargets.enabled, true)))
		.all();
	await Promise.all(targets.map((t) => sendToTarget(t, message)));
}

export interface UnlockBatch {
	gameId: number;
	gameName: string;
	names: string[];
	unlocked: number;
	total: number;
	perfect: boolean;
}

/** One message per game: the achievements unlocked since the last sync, or the 100%. */
export function unlockMessage(batch: UnlockBatch): NotificationMessage {
	const path = `/game/${batch.gameId}`;
	if (batch.perfect) {
		return {
			title: `Perfection achieved: ${batch.gameName}`,
			body: `All ${batch.total} achievements unlocked. Added to your Hall of Fame.`,
			path,
			perfect: true
		};
	}
	const shown = batch.names.slice(0, 5);
	const more = batch.names.length - shown.length;
	return {
		title:
			batch.names.length === 1
				? `Achievement unlocked: ${batch.names[0]}`
				: `${batch.names.length} achievements unlocked`,
		body: `${batch.gameName} · ${batch.unlocked}/${batch.total}${
			batch.names.length > 1 ? `\n${shown.join(', ')}${more > 0 ? ` and ${more} more` : ''}` : ''
		}`,
		path
	};
}
