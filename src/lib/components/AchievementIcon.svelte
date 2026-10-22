<script lang="ts">
	import { Lock, Sparkle } from '@lucide/svelte';

	let {
		src,
		locked = false,
		size = 40
	}: { src: string | null; locked?: boolean; size?: number } = $props();
	let failed = $state(false);
</script>

<span
	class="relative grid shrink-0 place-items-center overflow-hidden border {locked
		? 'border-[#2a241b] bg-[#111]'
		: 'border-[#4a3f2e] bg-[radial-gradient(circle,#3b2f1c,#120e09)]'}"
	style="width: {size}px; height: {size}px"
>
	{#if src && !failed}
		<img
			{src}
			alt=""
			loading="lazy"
			class="size-full object-cover {locked ? 'opacity-70 grayscale' : ''}"
			onerror={() => (failed = true)}
		/>
	{:else if locked}
		<Lock class="size-[45%] text-faint" strokeWidth={1.5} />
	{:else}
		<Sparkle class="size-[45%] text-ember" strokeWidth={1.5} />
	{/if}
</span>
