import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { parseBody, requireUser } from '$lib/server/api';
import { markCelebrated } from '$lib/server/services/account';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request }) => {
	const user = requireUser(locals);
	const { gameId } = await parseBody(request, z.object({ gameId: z.number().int().positive() }));
	markCelebrated(user.id, gameId);
	return json({ ok: true });
};
