import { error, fail } from '@sveltejs/kit';
import { and, asc, eq } from 'drizzle-orm';
import { idParam } from '$lib/server/api';
import { getDb } from '$lib/server/db/client';
import { achievements, type GroupKind, type SplitRuleType } from '$lib/server/db/schema';
import { getGame } from '$lib/server/services/games';
import { describeRule } from '$lib/server/services/split-rules';
import {
	SplitError,
	addRule,
	applyPrefixSuggestion,
	assignAchievements,
	clearSplit,
	createGroup,
	deleteGroup,
	deleteRule,
	groupsOf,
	importSplit,
	moveGroup,
	rulesOf,
	shippedSplit,
	suggest,
	updateGroup
} from '$lib/server/services/splits';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const game = getGame(idParam(params.id));
	if (!game) error(404, 'This game is not in Savepoint.');
	const list = getDb()
		.select({
			id: achievements.id,
			key: achievements.key,
			name: achievements.name,
			description: achievements.description,
			hidden: achievements.hidden,
			sortOrder: achievements.sortOrder,
			groupId: achievements.groupId,
			groupManual: achievements.groupManual
		})
		.from(achievements)
		.where(and(eq(achievements.gameId, game.id), eq(achievements.source, 'steam')))
		.orderBy(asc(achievements.sortOrder))
		.all();
	const groups = groupsOf(game.id);
	const rules = rulesOf(game.id).map((r) => ({
		...r,
		label: describeRule(r),
		groupName: groups.find((g) => g.id === r.groupId)?.name ?? '?'
	}));
	return {
		game: { id: game.id, name: game.name, steamAppId: game.steamAppId },
		groups: groups.map((g) => ({ ...g, count: list.filter((a) => a.groupId === g.id).length })),
		rules,
		achievements: list,
		suggestion: await suggest(game.id, game.steamAppId),
		hasShipped: game.steamAppId ? shippedSplit(game.steamAppId) !== null : false
	};
};

const text = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
const num = (form: FormData, key: string) => {
	const n = Number(form.get(key));
	return Number.isInteger(n) && n > 0 ? n : undefined;
};
const kindOf = (value: unknown): GroupKind => (value === 'dlc' ? 'dlc' : 'game');

/** Runs an action, turning a SplitError into a message for the page. */
async function guarded(run: () => void | Promise<void>, ok: string) {
	try {
		await run();
		return { ok };
	} catch (cause) {
		if (cause instanceof SplitError) return fail(400, { error: cause.message });
		throw cause;
	}
}

export const actions: Actions = {
	createGroup: async ({ request, params }) => {
		const form = await request.formData();
		return guarded(
			() => void createGroup(idParam(params.id), text(form, 'name'), kindOf(form.get('kind'))),
			'Group added.'
		);
	},
	updateGroup: async ({ request, params }) => {
		const form = await request.formData();
		return guarded(
			() =>
				updateGroup(idParam(params.id), Number(form.get('groupId')), {
					name: form.has('name') ? text(form, 'name') : undefined,
					kind: form.has('kind') ? kindOf(form.get('kind')) : undefined
				}),
			'Saved.'
		);
	},
	moveGroup: async ({ request, params }) => {
		const form = await request.formData();
		moveGroup(
			idParam(params.id),
			Number(form.get('groupId')),
			form.get('direction') === 'up' ? -1 : 1
		);
		return { ok: '' };
	},
	deleteGroup: async ({ request, params }) => {
		const form = await request.formData();
		return guarded(
			() => deleteGroup(idParam(params.id), Number(form.get('groupId'))),
			'Group removed. Its achievements went back to the rules.'
		);
	},
	addRule: async ({ request, params }) => {
		const form = await request.formData();
		const type = form.get('type') as SplitRuleType;
		if (!['prefix', 'range', 'contains'].includes(type))
			return fail(400, { error: 'Pick a rule.' });
		return guarded(
			() =>
				addRule(idParam(params.id), {
					groupId: Number(form.get('groupId')),
					type,
					value: text(form, 'value'),
					from: num(form, 'from'),
					to: num(form, 'to')
				}),
			'Rule added.'
		);
	},
	deleteRule: async ({ request, params }) => {
		const form = await request.formData();
		deleteRule(idParam(params.id), Number(form.get('ruleId')));
		return { ok: 'Rule removed.' };
	},
	assign: async ({ request, params }) => {
		const form = await request.formData();
		const ids = form.getAll('ids').map(Number).filter(Number.isInteger);
		if (ids.length === 0) return fail(400, { error: 'Select some achievements first.' });
		const target = String(form.get('target') ?? '');
		const groupId = target === 'rules' || target === 'none' ? target : Number(target);
		if (typeof groupId === 'number' && !Number.isInteger(groupId)) {
			return fail(400, { error: 'Pick where to move them.' });
		}
		return guarded(
			() => assignAchievements(idParam(params.id), ids, groupId),
			`Moved ${ids.length} achievement${ids.length === 1 ? '' : 's'}.`
		);
	},
	suggestion: async ({ request, params }) => {
		const form = await request.formData();
		const prefixes = form.getAll('prefix').map(String);
		const names = form.getAll('name').map(String);
		return guarded(
			() =>
				applyPrefixSuggestion(
					idParam(params.id),
					prefixes.map((prefix, i) => ({ prefix, name: names[i] ?? '' }))
				),
			'Groups created from the API names.'
		);
	},
	import: async ({ request, params }) => {
		const raw = text(await request.formData(), 'file');
		let json: unknown;
		try {
			json = JSON.parse(raw);
		} catch {
			return fail(400, { error: 'That is not JSON. Paste the whole exported file.' });
		}
		return guarded(() => importSplit(idParam(params.id), json), 'Split imported.');
	},
	clear: async ({ params }) => {
		clearSplit(idParam(params.id));
		return { ok: 'Split removed.' };
	}
};
