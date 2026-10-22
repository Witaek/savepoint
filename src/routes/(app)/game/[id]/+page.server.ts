import { error, fail, redirect } from '@sveltejs/kit';
import { PLATFORMS, isGameStatus } from '$lib/games';
import { idParam } from '$lib/server/api';
import { config } from '$lib/server/config';
import { getUser } from '$lib/server/services/account';
import {
	AchievementError,
	achievementsFor,
	addChecklistItem,
	canTick,
	deleteChecklistItem,
	setUnlocked
} from '$lib/server/services/achievements';
import { getGame, refreshDetails, schemaIsStale, syncSchema } from '$lib/server/services/games';
import { groupsOf } from '$lib/server/services/splits';
import {
	addToLibrary,
	getEntry,
	progressFor,
	removeFromLibrary,
	updateEntry,
	updatePerfection
} from '$lib/server/services/library';
import { isSyncing, syncGameAchievements } from '$lib/server/services/steam-sync';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const id = idParam(params.id);
	let game = getGame(id);
	if (!game) error(404, 'This game is not in Savepoint.');
	const userId = locals.user!.id;

	// First visit: fetch store/IGDB details and, for Steam games, the achievement list.
	const firstLoad: Promise<unknown>[] = [];
	if (!game.detailsUpdatedAt) firstLoad.push(refreshDetails(game));
	else void refreshDetails(game).catch(() => {});
	if (game.steamAppId && config().steamConfigured && schemaIsStale(game)) {
		const pending = syncSchema(game.id, game.steamAppId);
		if (!game.schemaUpdatedAt) firstLoad.push(pending);
		else void pending.catch(() => {});
	}
	await Promise.allSettled(firstLoad);
	game = getGame(id)!;

	const entry = getEntry(userId, id) ?? null;
	const achievements = achievementsFor(userId, id).map((a) => ({
		...a,
		tickable: entry ? canTick(a, entry.steamOwned) : false
	}));
	const user = getUser(userId)!;
	return {
		game,
		entry,
		achievements,
		progress: progressFor(userId, id),
		groups: groupsOf(id).map((g) => ({ id: g.id, name: g.name, kind: g.kind })),
		showHidden: user.prefs.showHidden ?? false,
		canSync: Boolean(entry?.steamOwned && user.steamId && config().steamConfigured),
		syncing: isSyncing(userId),
		isAdmin: locals.user!.role === 'admin',
		userId,
		platforms: PLATFORMS
	};
};

const text = (form: FormData, key: string) => {
	const value = form.get(key);
	return typeof value === 'string' ? value.trim() : '';
};

export const actions: Actions = {
	add: async ({ request, params, locals }) => {
		const id = idParam(params.id);
		const form = await request.formData();
		const status = form.get('status');
		if (!getGame(id) || !isGameStatus(status)) return fail(400, { error: 'Choose a status.' });
		addToLibrary(locals.user!.id, id, { status, platform: text(form, 'platform') || null });
		updatePerfection(locals.user!.id, id);
		return { ok: 'Added to your library.' };
	},
	update: async ({ request, params, locals }) => {
		const id = idParam(params.id);
		if (!getEntry(locals.user!.id, id)) return fail(400, { error: 'Add the game first.' });
		const form = await request.formData();
		const values: Parameters<typeof updateEntry>[2] = {};
		const status = form.get('status');
		if (status !== null) {
			if (!isGameStatus(status)) return fail(400, { error: 'Unknown status.' });
			values.status = status;
		}
		if (form.has('platform')) values.platform = text(form, 'platform') || null;
		if (form.has('notes')) values.notes = text(form, 'notes').slice(0, 4000) || null;
		if (form.has('rating')) {
			const rating = Number(form.get('rating'));
			values.rating = Number.isInteger(rating) && rating >= 1 && rating <= 10 ? rating : null;
		}
		updateEntry(locals.user!.id, id, values);
		return { ok: 'Saved.' };
	},
	remove: async ({ params, locals }) => {
		removeFromLibrary(locals.user!.id, idParam(params.id));
		redirect(303, '/library');
	},
	tick: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			const { perfected } = setUnlocked(
				locals.user!.id,
				Number(form.get('achievementId')),
				form.get('unlocked') === '1'
			);
			return { perfected };
		} catch (cause) {
			if (cause instanceof AchievementError) return fail(400, { error: cause.message });
			throw cause;
		}
	},
	addItem: async ({ request, params, locals }) => {
		const form = await request.formData();
		try {
			addChecklistItem(locals.user!.id, idParam(params.id), {
				name: text(form, 'name'),
				description: text(form, 'description'),
				groupId: Number(form.get('groupId')) || null
			});
			return { ok: 'Added to the checklist.' };
		} catch (cause) {
			if (cause instanceof AchievementError) return fail(400, { error: cause.message });
			throw cause;
		}
	},
	deleteItem: async ({ request, locals }) => {
		const form = await request.formData();
		try {
			deleteChecklistItem(locals.user!, Number(form.get('achievementId')));
			return { ok: 'Removed.' };
		} catch (cause) {
			if (cause instanceof AchievementError) return fail(400, { error: cause.message });
			throw cause;
		}
	},
	sync: async ({ params, locals }) => {
		const id = idParam(params.id);
		const user = getUser(locals.user!.id)!;
		if (!user.steamId) return fail(400, { error: 'Link your Steam account first.' });
		try {
			const result = await syncGameAchievements(user.id, user.steamId, id);
			const n = result?.newUnlocks.length ?? 0;
			return { ok: n ? `${n} new achievement${n === 1 ? '' : 's'}.` : 'Up to date.' };
		} catch (cause) {
			return fail(502, { error: cause instanceof Error ? cause.message : 'Steam did not answer.' });
		}
	}
};
