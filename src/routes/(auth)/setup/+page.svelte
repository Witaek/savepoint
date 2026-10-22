<script lang="ts">
	import { enhance } from '$app/forms';
	import FormField from '$lib/components/FormField.svelte';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Welcome · Savepoint</title></svelte:head>

<div class="panel p-6 md:p-8">
	<h2 class="rule-title">Create the admin account</h2>
	<p class="mt-2 mb-6 text-dust">
		This is the first start. The admin can add accounts for everyone else later.
	</p>
	<form
		method="POST"
		class="space-y-4"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update();
				submitting = false;
			};
		}}
	>
		<FormField
			label="Username"
			name="username"
			autocomplete="username"
			autocapitalize="none"
			required
			value={form?.username ?? ''}
			error={form?.errors?.username}
		/>
		<FormField
			label="Display name"
			name="displayName"
			autocomplete="name"
			hint="Optional. Shown in the app."
			value={form?.displayName ?? ''}
		/>
		<FormField
			label="Password"
			name="password"
			type="password"
			autocomplete="new-password"
			required
			hint="At least 8 characters."
			error={form?.errors?.password}
		/>
		<FormField
			label="Confirm password"
			name="confirm"
			type="password"
			autocomplete="new-password"
			required
			error={form?.errors?.confirm}
		/>
		<button type="submit" class="btn w-full" disabled={submitting}>
			{submitting ? 'Creating…' : 'Create account'}
		</button>
	</form>
</div>
