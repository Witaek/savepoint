<script lang="ts">
	import { ChevronRight, Settings } from '@lucide/svelte';
	import AchievementIcon from '$lib/components/AchievementIcon.svelte';
	import Cover from '$lib/components/Cover.svelte';
	import EmberBar from '$lib/components/EmberBar.svelte';
	import Rarity from '$lib/components/Rarity.svelte';
	import UnlockRow from '$lib/components/UnlockRow.svelte';
	import { formatPlaytime, percent, steamImage } from '$lib/games';
	import { formatNumber, relativeTime } from '$lib/format';

	let { data } = $props();
	const current = $derived(data.current);
	let heroFailed = $state(false);
	const heroSrc = $derived(
		current && !heroFailed
			? (current.game.hero ??
					(current.game.steamAppId ? steamImage.hero(current.game.steamAppId) : null))
			: null
	);
</script>

<svelte:head><title>Bonfire · Savepoint</title></svelte:head>

<main
	class="mx-auto grid max-w-6xl gap-8 px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-10 md:px-8 md:pt-8"
>
	<header class="flex items-center justify-between">
		<h1 class="font-display text-2xl tracking-[0.14em] text-ash md:text-3xl">BONFIRE</h1>
		<a href="/settings" class="text-dust hover:text-ash lg:hidden" aria-label="Settings"
			><Settings class="size-5" strokeWidth={1.5} /></a
		>
	</header>

	{#if !data.steam.linked && data.empty}
		<section class="panel grid gap-3 p-6 md:p-8">
			<h2 class="rule-title">Kindle your first bonfire</h2>
			<p class="max-w-prose text-dust">
				{#if data.steam.configured}
					Link your Steam account to bring in every game you own, with its playtime and
					achievements. Or add games from any platform with Search.
				{:else}
					Steam import needs a Steam Web API key on the server (<code class="font-mono text-soul"
						>STEAM_API_KEY</code
					>). Meanwhile, add games from any platform with Search.
				{/if}
			</p>
			<div class="flex flex-wrap gap-3">
				{#if data.steam.configured}<a href="/settings#steam" class="btn">Link Steam</a>{/if}
				<a href="/search" class="btn btn-ghost">Search for a game</a>
			</div>
		</section>
	{/if}

	{#if current}
		<section aria-labelledby="current-title" class="grid gap-3">
			<h2 class="rule-title">Currently kindled</h2>
			<div class="grid overflow-hidden border border-[#2a241b] md:grid-cols-[1fr_320px]">
				<a
					href="/game/{current.game.id}"
					class="hero relative flex min-h-56 flex-col justify-end gap-2 p-5 md:min-h-64 md:p-7"
				>
					{#if heroSrc}
						<img
							src={heroSrc}
							alt=""
							class="absolute inset-0 size-full object-cover opacity-55"
							onerror={() => (heroFailed = true)}
						/>
					{/if}
					<div
						class="absolute inset-0 bg-gradient-to-t from-[#0a0907] via-[#0a0907]/60 to-transparent"
					></div>
					<span class="label relative !text-ember"
						>{current.entry.platform ?? 'Playing'} · {formatPlaytime(
							current.entry.playtimeMinutes
						)}{current.entry.lastPlayedAt
							? ` · ${relativeTime(current.entry.lastPlayedAt)}`
							: ''}</span
					>
					<h3
						id="current-title"
						class="relative font-display text-3xl leading-none font-black tracking-[0.1em] text-[#f3e6c4] uppercase [text-shadow:0_2px_20px_rgba(0,0,0,.8)] md:text-[2.6rem]"
					>
						{current.game.name}
					</h3>
					{#if current.progress.total > 0}
						<p class="relative text-dust italic">
							{#if current.remainingCount === 0}
								Every achievement is yours.
							{:else if current.remainingCount === 1}
								One achievement stands between you and 100%.
							{:else}
								{current.remainingCount} achievements stand between you and 100%.
							{/if}
						</p>
						<div class="relative flex items-baseline gap-3 font-mono text-xs text-dust">
							<b class="font-display text-xl font-normal tracking-[0.06em] text-ash"
								>{current.progress.unlocked} / {current.progress.total}</b
							>
							{percent(current.progress)}%
						</div>
						<EmberBar value={percent(current.progress)} class="relative" label="Achievements" />
					{:else}
						<p class="relative text-dust italic">No achievements to hunt in this one.</p>
					{/if}
				</a>
				{#if current.remaining.length}
					<div
						class="grid content-start gap-3 border-t border-[#2a241b] bg-[#0e0c09] p-4 md:border-t-0 md:border-l"
					>
						<span class="label">Remaining · most common first</span>
						{#each current.remaining as a (a.id)}
							<div class="flex items-center gap-3">
								<AchievementIcon src={a.iconLocked ?? a.icon} locked size={36} />
								<span class="min-w-0 flex-1">
									<span class="block font-display text-[12.5px] leading-tight tracking-[0.04em]"
										>{a.hidden ? 'Hidden achievement' : a.name}</span
									>
									<span class="line-clamp-1 text-[13px] text-dust"
										>{a.hidden ? 'Revealed on the game page' : (a.description ?? '')}</span
									>
								</span>
								<Rarity value={a.globalPercent} />
							</div>
						{/each}
						<a
							href="/game/{current.game.id}"
							class="label mt-1 flex items-center gap-1 hover:!text-ash"
							>All achievements <ChevronRight class="size-3" /></a
						>
					</div>
				{/if}
			</div>
		</section>
	{/if}

	{#if !data.empty}
		<section aria-label="Summary">
			<a
				href="/stats"
				class="grid grid-cols-2 border border-[#2a241b] hover:border-ember-dim sm:grid-cols-4"
			>
				{#each [{ v: formatNumber(data.summary.perfected), l: 'Perfected' }, { v: `${data.summary.averageCompletion}%`, l: 'Avg completion' }, { v: formatNumber(data.summary.unlocks), l: 'Achievements' }, { v: formatNumber(data.summary.backlog), l: 'Backlog' }] as stat, i (stat.l)}
					<div
						class="border-[#2a241b] px-4 py-3 {i % 2 === 0 ? 'border-r' : ''} {i < 2
							? 'border-b sm:border-b-0'
							: ''} {i === 1 ? 'sm:border-r' : ''}"
					>
						<div class="font-display text-2xl tabular-nums">{stat.v}</div>
						<div class="label">{stat.l}</div>
					</div>
				{/each}
			</a>
			{#if data.summary.unsorted > 0}
				<a
					href="/library?status=unsorted"
					class="mt-3 flex items-center justify-between gap-3 border border-ember-dim bg-gradient-to-r from-ember/10 to-transparent px-4 py-3 text-sm"
				>
					<span
						><b class="font-display tracking-[0.06em] text-ember">{data.summary.unsorted} games</b> from
						Steam are waiting to be sorted into Backlog, Beaten or Abandoned.</span
					>
					<ChevronRight class="size-4 shrink-0 text-ember" />
				</a>
			{/if}
		</section>
	{/if}

	<div class="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
		{#if data.almostThere.length}
			<section class="grid content-start gap-3">
				<h2 class="rule-title">Almost there</h2>
				<div class="grid grid-cols-3 gap-3 sm:grid-cols-5">
					{#each data.almostThere as item, i (item.game.id)}
						<Cover
							game={item.game}
							progress={item.progress}
							platform={item.entry.platform}
							href="/game/{item.game.id}"
							eager={i < 5}
						/>
					{/each}
				</div>
			</section>
		{:else if data.otherPlaying.length}
			<section class="grid content-start gap-3">
				<h2 class="rule-title">Also playing</h2>
				<div class="grid grid-cols-3 gap-3 sm:grid-cols-5">
					{#each data.otherPlaying as item (item.game.id)}
						<Cover game={item.game} progress={item.progress} href="/game/{item.game.id}" />
					{/each}
				</div>
			</section>
		{/if}
		{#if data.recent.length}
			<section class="grid content-start gap-2">
				<h2 class="rule-title">Recent unlocks</h2>
				<div class="grid">
					{#each data.recent as unlock (unlock.achievementId)}
						<UnlockRow {unlock} />
					{/each}
				</div>
			</section>
		{/if}
	</div>
</main>

<style>
	.hero {
		background:
			radial-gradient(
				circle at 72% 38%,
				rgb(255 214 120 / 0.35) 0 2%,
				rgb(255 190 90 / 0.12) 10%,
				transparent 32%
			),
			linear-gradient(180deg, #2a2216 0%, #15110b 60%, #0a0907 100%);
	}
</style>
