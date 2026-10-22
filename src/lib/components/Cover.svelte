<script lang="ts">
	import { isPerfect, percent, steamImage, type Progress } from '$lib/games';

	interface Props {
		game: { id: number; name: string; cover: string | null; steamAppId: number | null };
		progress?: Progress | null;
		platform?: string | null;
		href?: string;
		/** Image loading priority (first rows of a grid). */
		eager?: boolean;
	}

	let { game, progress = null, platform = null, href, eager = false }: Props = $props();

	// Steam's portrait cover doesn't exist for some older games: fall back to the store header,
	// then to a painted card with the name.
	const sources = $derived(
		[game.cover, game.steamAppId ? steamImage.header(game.steamAppId) : null].filter(
			(s): s is string => Boolean(s)
		)
	);
	let failed = $state(0);
	const src = $derived(sources[failed] ?? null);
	const perfect = $derived(progress ? isPerfect(progress) : false);
	const pct = $derived(progress ? percent(progress) : 0);
	// A stable hue per game for painted placeholders.
	const hue = $derived([...game.name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7));
</script>

<svelte:element
	this={href ? 'a' : 'div'}
	{href}
	aria-label={href ? game.name : undefined}
	class="cover group relative block aspect-[3/4] overflow-hidden border border-[#2a241b] bg-stone transition {perfect
		? 'perfect'
		: ''} {href ? 'hover:border-ember-dim' : ''}"
	style="--hue: {hue}"
	data-sveltekit-preload-data={href ? 'hover' : undefined}
>
	{#if src}
		<img
			{src}
			alt=""
			loading={eager ? 'eager' : 'lazy'}
			decoding="async"
			class="absolute inset-0 size-full object-cover transition duration-300 group-hover:scale-[1.03]"
			onerror={() => failed++}
		/>
	{:else}
		<div class="painted absolute inset-0"></div>
		<span
			class="absolute inset-x-2.5 bottom-3 font-display text-[13px] leading-tight font-bold tracking-[0.08em] [overflow-wrap:anywhere] text-ash uppercase"
			>{game.name}</span
		>
	{/if}
	<div
		class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-80"
	></div>
	{#if platform && platform !== 'Steam'}
		<span class="label absolute top-2 left-2 !text-[0.58rem] !text-ash/80">{platform}</span>
	{/if}
	{#if progress && progress.total > 0}
		{#if perfect}
			<span
				class="absolute top-2 right-2 border border-[#ffe2a0] bg-gradient-to-b from-[#ffe2a0] to-ember px-1.5 font-mono text-[10px] font-medium text-[#1a1206]"
				>100%</span
			>
		{:else}
			<span
				class="absolute top-2 right-2 border border-white/15 bg-black/65 px-1.5 font-mono text-[10px] text-ash"
				>{pct}%</span
			>
			<span class="absolute inset-x-0 bottom-0 h-[3px] bg-black/60"
				><i class="absolute inset-y-0 left-0 bg-ember" style="width: {pct}%"></i></span
			>
		{/if}
	{/if}
</svelte:element>

<style>
	.perfect {
		border-color: #ffe2a0;
		box-shadow:
			0 0 0 1px #ffe2a0,
			0 0 18px -4px rgb(255 190 90 / 0.7);
	}
	.painted {
		background:
			radial-gradient(circle at 50% 30%, hsl(var(--hue) 60% 60% / 0.35), transparent 40%),
			linear-gradient(180deg, hsl(var(--hue) 25% 18%), #0b0a08 85%);
	}
</style>
