<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends HTMLInputAttributes {
		label: string;
		error?: string | null;
		hint?: string;
	}

	let { label, error = null, hint, id, value = $bindable(), ...rest }: Props = $props();
	const inputId = $derived(id ?? `field-${rest.name}`);
</script>

<div class="space-y-1.5">
	<label for={inputId} class="label block">{label}</label>
	<input
		id={inputId}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error || hint ? `${inputId}-note` : undefined}
		class="input {error ? '!border-blood/70' : ''}"
		{...rest}
	/>
	{#if error}
		<p id="{inputId}-note" class="text-sm text-blood">{error}</p>
	{:else if hint}
		<p id="{inputId}-note" class="text-sm text-dust">{hint}</p>
	{/if}
</div>
