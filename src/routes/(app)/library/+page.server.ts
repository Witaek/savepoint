import { fail } from '@sveltejs/kit';
import { isGameStatus } from '$lib/games';
import { getEntry, listLibrary, statusCounts, updateEntry } from '$lib/server/services/library';
import type { Actions, PageServerLoad } from './$types';

// Filters and sorting happen in the page, so changing them is instant and doesn't reload.
export const load: PageServerLoad = ({ locals }) => ({
	items: listLibrary(locals.user!.id),
	counts: statusCounts(locals.user!.id)
});

export const actions: Actions = {
	status: async ({ request, locals }) => {
		const form = await request.formData();
		const gameId = Number(form.get('gameId'));
		const status = form.get('status');
		if (!isGameStatus(status) || !getEntry(locals.user!.id, gameId)) {
			return fail(400, { error: 'Unknown game or status.' });
		}
		updateEntry(locals.user!.id, gameId, { status });
		return { ok: true };
	}
};
