<script lang="ts">
	import AchievementIcon from '$lib/components/AchievementIcon.svelte';
	import Cover from '$lib/components/Cover.svelte';
	import Rarity from '$lib/components/Rarity.svelte';
	import { formatPlaytime } from '$lib/games';
	import { formatDate } from '$lib/format';

	let { data } = $props();
</script>

<svelte:head><title>Hall of Fame · Savepoint</title></svelte:head>

<main
	class="mx-auto grid max-w-6xl gap-6 px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-10 md:px-8 md:pt-8"
>
	<header class="grid gap-1">
		<h1
			class="font-display text-2xl tracking-[0.14em] text-gold [text-shadow:0_0_24px_rgba(255,190,90,.35)] md:text-3xl"
		>
			HALL OF FAME
		</h1>
		<p class="text-dust italic">
			{data.games.length === 0
				? 'Every game you take to 100% is enshrined here.'
				: `${data.games.length} game${data.games.length === 1 ? '' : 's'} taken to 100%.`}
		</p>
	</header>

	{#if data.games.length}
		<ul class="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
			{#each data.games as item, i (item.game.id)}
				<li class="grid content-start gap-2">
					<Cover
						game={item.game}
						progress={item.progress}
						href="/game/{item.game.id}"
						eager={i < 10}
					/>
					<div class="grid gap-0.5">
						<p class="font-display text-[13px] leading-snug tracking-[0.05em]">{item.game.name}</p>
						<p class="font-mono text-[10.5px] text-gold/80">
							{formatDate(item.perfectedAt)} · {item.progress.total} achievements
						</p>
						<p class="font-mono text-[10.5px] text-dust">
							{formatPlaytime(item.playtimeMinutes)}{item.platform ? ` · ${item.platform}` : ''}
						</p>
					</div>
					{#if item.rarest}
						<div
							class="flex items-center gap-2 border-t border-[#2a241b] pt-2"
							title="Rarest achievement"
						>
							<AchievementIcon src={item.rarest.icon} size={26} />
							<span class="min-w-0 flex-1 truncate text-[12.5px]">{item.rarest.name}</span>
							<Rarity value={item.rarest.globalPercent} />
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{:else}
		<div class="panel grid gap-3 p-6">
			<p class="text-dust">
				Nothing enshrined yet. The <a
					href="/library?sort=completion"
					class="text-ember underline underline-offset-4">games closest to 100%</a
				> are a good place to start.
			</p>
		</div>
	{/if}
</main>
