import { error, json } from '@sveltejs/kit';
import { idParam, requireUser } from '$lib/server/api';
import { getGame } from '$lib/server/services/games';
import { exportSplit } from '$lib/server/services/splits';
import type { RequestHandler } from './$types';

/** A game's split as a file, to keep, share, or add to Savepoint's shipped splits. */
export const GET: RequestHandler = ({ locals, params }) => {
	requireUser(locals);
	const game = getGame(idParam(params.id));
	if (!game) error(404, 'Not found');
	const file = exportSplit(game.id, { steamAppId: game.steamAppId, name: game.name });
	return json(file, {
		headers: {
			'content-disposition': `attachment; filename="${game.steamAppId ?? `game-${game.id}`}.json"`,
			'cache-control': 'no-store'
		}
	});
};
