import { fail, redirect } from '@sveltejs/kit';
import { and, eq, inArray, or } from 'drizzle-orm';
import { PLATFORMS, isGameStatus, type GameStatus } from '$lib/games';
import { getDb } from '$lib/server/db/client';
import { games, libraryEntries } from '$lib/server/db/schema';
import { createManualGame } from '$lib/server/services/games';
import { addToLibrary, updatePerfection } from '$lib/server/services/library';
import { gameFromKey, searchGames, searchSource } from '$lib/server/services/search';
import type { Actions, PageServerLoad } from './$types';

/** Which results are already in this person's library, by result key. */
function libraryStatus(
	userId: number,
	keys: string[]
): Record<string, { gameId: number; status: GameStatus }> {
	const steamIds = keys.filter((k) => k.startsWith('steam:')).map((k) => Number(k.slice(6)));
	const igdbIds = keys.filter((k) => k.startsWith('igdb:')).map((k) => Number(k.slice(5)));
	if (!steamIds.length && !igdbIds.length) return {};
	const rows = getDb()
		.select({
			gameId: games.id,
			steamAppId: games.steamAppId,
			igdbId: games.igdbId,
			status: libraryEntries.status
		})
		.from(libraryEntries)
		.innerJoin(games, eq(games.id, libraryEntries.gameId))
		.where(
			and(
				eq(libraryEntries.userId, userId),
				or(
					steamIds.length ? inArray(games.steamAppId, steamIds) : undefined,
					igdbIds.length ? inArray(games.igdbId, igdbIds) : undefined
				)
			)
		)
		.all();
	const found: Record<string, { gameId: number; status: GameStatus }> = {};
	for (const row of rows) {
		if (row.steamAppId) found[`steam:${row.steamAppId}`] = row;
		if (row.igdbId) found[`igdb:${row.igdbId}`] = row;
	}
	return found;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const q = url.searchParams.get('q')?.trim() ?? '';
	const source = searchSource();
	let results: Awaited<ReturnType<typeof searchGames>> = [];
	let error: string | null = null;
	if (q.length >= 2) {
		try {
			results = await searchGames(q);
		} catch (cause) {
			error = cause instanceof Error ? cause.message : 'Search is unavailable right now.';
		}
	}
	return {
		q,
		source,
		results,
		error,
		inLibrary: libraryStatus(
			locals.user!.id,
			results.map((r) => r.key)
		),
		platforms: PLATFORMS
	};
};

const field = (form: FormData, key: string) => String(form.get(key) ?? '').trim();

export const actions: Actions = {
	add: async ({ request, locals }) => {
		const form = await request.formData();
		const status = form.get('status');
		if (!isGameStatus(status)) return fail(400, { error: 'Choose a status.' });
		let gameId: number | null;
		try {
			gameId = await gameFromKey(field(form, 'key'), field(form, 'name'));
		} catch (cause) {
			return fail(502, { error: cause instanceof Error ? cause.message : 'Could not add it.' });
		}
		if (!gameId) return fail(404, { error: 'That game could not be found any more.' });
		addToLibrary(locals.user!.id, gameId, { status, platform: field(form, 'platform') || null });
		updatePerfection(locals.user!.id, gameId);
		return {
			ok: `Added as ${status === 'wishlist' ? 'wishlisted' : status.replace('_', ' ')}.`,
			gameId
		};
	},
	manual: async ({ request, locals }) => {
		const form = await request.formData();
		const name = field(form, 'name');
		const status = form.get('status');
		if (!name) return fail(400, { error: 'Give the game a name.' });
		if (!isGameStatus(status)) return fail(400, { error: 'Choose a status.' });
		const platform = field(form, 'platform') || null;
		const gameId = createManualGame(name.slice(0, 200), platform ?? undefined);
		addToLibrary(locals.user!.id, gameId, { status, platform });
		redirect(303, `/game/${gameId}`);
	}
};
