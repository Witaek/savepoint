<script lang="ts">
	import { enhance } from '$app/forms';
	import FormField from '$lib/components/FormField.svelte';

	let { form } = $props();
	let submitting = $state(false);
</script>

<svelte:head><title>Sign in · Savepoint</title></svelte:head>

<div class="panel p-6 md:p-8">
	<h2 class="rule-title mb-6">Sign in</h2>
	<form
		method="POST"
		class="space-y-4"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				await update({ reset: false });
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
		/>
		<FormField
			label="Password"
			name="password"
			type="password"
			autocomplete="current-password"
			required
		/>
		{#if form?.error}
			<p class="border border-blood/40 bg-blood/10 px-3.5 py-2.5 text-sm text-blood" role="alert">
				{form.error}
			</p>
		{/if}
		<button type="submit" class="btn w-full" disabled={submitting}>
			{submitting ? 'Signing in…' : 'Sign in'}
		</button>
	</form>
	<p class="mt-5 text-center text-sm text-dust">
		Forgot your password? Ask the person who runs this server to reset it.
	</p>
</div>
