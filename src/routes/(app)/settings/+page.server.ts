import { error, fail } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import {
	deleteUserSessions,
	hashPassword,
	validatePassword,
	verifyPassword
} from '$lib/server/auth';
import { config } from '$lib/server/config';
import { getDb } from '$lib/server/db/client';
import { notificationTargets, users } from '$lib/server/db/schema';
import { jobStatus } from '$lib/server/jobs/scheduler';
import { getUser, updatePrefs } from '$lib/server/services/account';
import { createBackup, listBackups } from '$lib/server/services/backup';
import { sendToTarget, validateTargetUrl } from '$lib/server/services/notifications';
import { fullSync, isSyncing, linkSteam, unlinkSteam } from '$lib/server/services/steam-sync';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	const user = getUser(locals.user!.id)!;
	const isAdmin = user.role === 'admin';
	const { steamConfigured, igdbConfigured } = config();
	return {
		account: { username: user.username, displayName: user.displayName, role: user.role },
		steam: {
			configured: steamConfigured,
			steamId: user.steamId,
			name: user.steamName,
			avatar: user.steamAvatar,
			syncedAt: user.steamSyncedAt,
			sync: user.steamSync,
			running: isSyncing(user.id) || user.steamSync.status === 'running'
		},
		prefs: {
			celebrate: user.prefs.celebrate !== false,
			showHidden: user.prefs.showHidden ?? false
		},
		targets: getDb()
			.select()
			.from(notificationTargets)
			.where(eq(notificationTargets.userId, user.id))
			.all(),
		igdbConfigured,
		isAdmin,
		backups: isAdmin ? listBackups().slice(0, 10) : [],
		jobs: isAdmin ? jobStatus() : [],
		version: __APP_VERSION__
	};
};

const field = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

export const actions: Actions = {
	profile: async ({ request, locals }) => {
		const displayName = field(await request.formData(), 'displayName').slice(0, 60);
		if (!displayName) return fail(400, { error: 'Enter a display name.' });
		getDb().update(users).set({ displayName }).where(eq(users.id, locals.user!.id)).run();
		return { ok: 'Saved.' };
	},
	password: async ({ request, locals }) => {
		const form = await request.formData();
		const user = getUser(locals.user!.id)!;
		if (!(await verifyPassword(user.passwordHash, String(form.get('current') ?? '')))) {
			return fail(400, { error: 'Your current password is wrong.' });
		}
		const password = String(form.get('password') ?? '');
		const problem = validatePassword(password);
		if (problem) return fail(400, { error: problem });
		getDb()
			.update(users)
			.set({ passwordHash: await hashPassword(password) })
			.where(eq(users.id, user.id))
			.run();
		deleteUserSessions(user.id, locals.sessionToken ?? undefined);
		return { ok: 'Password changed. Your other devices were signed out.' };
	},
	signOutOthers: async ({ locals }) => {
		deleteUserSessions(locals.user!.id, locals.sessionToken ?? undefined);
		return { ok: 'Signed out everywhere else.' };
	},
	prefs: async ({ request, locals }) => {
		const form = await request.formData();
		updatePrefs(locals.user!.id, (prefs) => ({
			...prefs,
			celebrate: form.get('celebrate') === 'on',
			showHidden: form.get('showHidden') === 'on'
		}));
		return { ok: 'Saved.' };
	},
	linkSteam: async ({ request, locals }) => {
		if (!config().steamConfigured)
			return fail(400, { error: 'Steam is not configured on the server.' });
		try {
			const problem = await linkSteam(locals.user!.id, field(await request.formData(), 'profile'));
			if (problem) return fail(400, { error: problem.error });
		} catch (cause) {
			return fail(502, { error: cause instanceof Error ? cause.message : 'Steam did not answer.' });
		}
		return { ok: 'Linked. Your library is being imported.' };
	},
	syncSteam: async ({ request, locals }) => {
		const all = (await request.formData()).get('all') === '1';
		if (isSyncing(locals.user!.id)) return { ok: 'Already syncing.' };
		// Runs in the background; the page shows its progress.
		void fullSync(locals.user!.id, { all }).catch(() => {});
		return { ok: all ? 'Re-reading every game…' : 'Syncing…' };
	},
	unlinkSteam: async ({ locals }) => {
		unlinkSteam(locals.user!.id);
		return { ok: 'Steam unlinked. Your games stay in your library.' };
	},
	addTarget: async ({ request, locals }) => {
		const form = await request.formData();
		const type = form.get('type') === 'discord' ? 'discord' : 'ntfy';
		const url = field(form, 'url');
		const problem = validateTargetUrl(type, url);
		if (problem) return fail(400, { error: problem });
		getDb().insert(notificationTargets).values({ userId: locals.user!.id, type, url }).run();
		return { ok: 'Added. Send a test to check it.' };
	},
	testTarget: async ({ request, locals }) => {
		const id = Number((await request.formData()).get('id'));
		const target = getDb()
			.select()
			.from(notificationTargets)
			.where(and(eq(notificationTargets.id, id), eq(notificationTargets.userId, locals.user!.id)))
			.get();
		if (!target) error(404, 'Not found');
		const sent = await sendToTarget(target, {
			title: 'Achievement unlocked: Linked',
			body: 'Savepoint will tell you here when you unlock achievements.',
			path: '/'
		});
		return sent ? { ok: 'Sent.' } : fail(502, { error: 'Sending failed. See the error below it.' });
	},
	toggleTarget: async ({ request, locals }) => {
		const id = Number((await request.formData()).get('id'));
		const db = getDb();
		const target = db
			.select()
			.from(notificationTargets)
			.where(and(eq(notificationTargets.id, id), eq(notificationTargets.userId, locals.user!.id)))
			.get();
		if (!target) error(404, 'Not found');
		db.update(notificationTargets)
			.set({ enabled: !target.enabled })
			.where(eq(notificationTargets.id, id))
			.run();
		return { ok: target.enabled ? 'Paused.' : 'Resumed.' };
	},
	deleteTarget: async ({ request, locals }) => {
		const id = Number((await request.formData()).get('id'));
		getDb()
			.delete(notificationTargets)
			.where(and(eq(notificationTargets.id, id), eq(notificationTargets.userId, locals.user!.id)))
			.run();
		return { ok: 'Removed.' };
	},
	backup: async ({ locals }) => {
		if (locals.user!.role !== 'admin') error(403, 'Only admins can make backups.');
		const backup = await createBackup({ manual: true });
		return { ok: `Saved ${backup.name}.` };
	}
};
