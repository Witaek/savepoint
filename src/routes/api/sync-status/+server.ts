import { json } from '@sveltejs/kit';
import { requireUser } from '$lib/server/api';
import { getUser } from '$lib/server/services/account';
import { isSyncing } from '$lib/server/services/steam-sync';
import type { RequestHandler } from './$types';

/** Polled by Settings while a Steam sync runs. */
export const GET: RequestHandler = ({ locals }) => {
	const user = getUser(requireUser(locals).id)!;
	return json(
		{ ...user.steamSync, running: isSyncing(user.id) || user.steamSync.status === 'running' },
		{ headers: { 'cache-control': 'no-store' } }
	);
};
