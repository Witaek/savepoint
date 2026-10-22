import type { SubmitFunction } from '@sveltejs/kit';
import { applyAction } from '$app/forms';
import { invalidateAll } from '$app/navigation';
import { toast } from 'svelte-sonner';

/**
 * `use:enhance` for small actions: shows the action's `ok` or `error` message as a toast and
 * reloads the page data, without resetting the form or scrolling.
 */
export function toastResult(
	options: {
		reset?: boolean;
		quiet?: boolean;
		onDone?: (data: Record<string, unknown>) => void;
	} = {}
): SubmitFunction {
	return ({ formElement }) =>
		async ({ result }) => {
			if (result.type === 'success') {
				const data = (result.data ?? {}) as Record<string, unknown>;
				if (typeof data.ok === 'string' && !options.quiet) toast.success(data.ok);
				options.onDone?.(data);
				if (options.reset) formElement.reset();
				await invalidateAll();
			} else if (result.type === 'failure') {
				const message = (result.data as { error?: string } | undefined)?.error;
				toast.error(message ?? 'That did not work.');
			} else {
				await applyAction(result);
			}
		};
}
