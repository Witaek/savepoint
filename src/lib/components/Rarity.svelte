<script lang="ts">
	import { rarity } from '$lib/games';

	let { value }: { value: number | null } = $props();
	const tier = $derived(rarity(value));
	const color = $derived(
		tier === 'ultra'
			? 'text-ember-hot'
			: tier === 'rare'
				? 'text-ember'
				: tier === 'uncommon'
					? 'text-soul'
					: 'text-dust'
	);
</script>

{#if value !== null}
	<span
		class="font-mono text-[11px] whitespace-nowrap tabular-nums {color}"
		title="Share of Steam players who have it"
		>{value < 10 ? value.toFixed(1) : Math.round(value)}%</span
	>
{/if}
