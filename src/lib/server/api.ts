import { error } from '@sveltejs/kit';
import type { z } from 'zod';
import type { SessionUser } from './auth';

/** Helpers for JSON API routes and form actions. */

export function requireUser(locals: App.Locals): SessionUser {
	if (!locals.user) error(401, 'Not signed in');
	return locals.user;
}

export async function parseBody<T extends z.ZodType>(
	request: Request,
	schema: T
): Promise<z.infer<T>> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Expected a JSON body');
	}
	const parsed = schema.safeParse(body);
	if (!parsed.success) error(400, parsed.error.issues[0]?.message ?? 'Invalid request');
	return parsed.data;
}

/** A positive integer route parameter, or 404. */
export function idParam(value: string): number {
	const id = Number(value);
	if (!Number.isInteger(id) || id <= 0) error(404, 'Not found');
	return id;
}
