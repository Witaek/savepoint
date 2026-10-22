import { getUser, pendingCelebration } from '$lib/server/services/account';
import { isSyncing } from '$lib/server/services/steam-sync';
import { progressFor } from '$lib/server/services/library';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const user = getUser(locals.user!.id)!;
	const celebration = pendingCelebration(user.id, user.prefs);
	return {
		user: {
			id: user.id,
			displayName: user.displayName,
			role: user.role,
			steamName: user.steamName
		},
		syncing: isSyncing(user.id) || user.steamSync.status === 'running',
		celebration: celebration && {
			...celebration,
			total: progressFor(user.id, celebration.gameId).total
		}
	};
};
