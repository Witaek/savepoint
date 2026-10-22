<script lang="ts">
	import UnlockRow from '$lib/components/UnlockRow.svelte';
	import { formatPlaytime } from '$lib/games';
	import { formatNumber } from '$lib/format';

	let { data } = $props();
	const maxMonth = $derived(Math.max(1, ...data.months.map((m) => m.count)));
	const maxBand = $derived(Math.max(1, ...data.bands.map((b) => b.count)));
	const maxPlayed = $derived(Math.max(1, ...data.mostPlayed.map((i) => i.entry.playtimeMinutes)));
	const monthLabel = (m: string) =>
		new Date(`${m}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'short' });
	const hours = $derived(Math.round(data.summary.playtimeMinutes / 60));
</script>

<svelte:head><title>Stats · Savepoint</title></svelte:head>

<main
	class="mx-auto grid max-w-6xl gap-8 px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-10 md:px-8 md:pt-8"
>
	<h1 class="font-display text-2xl tracking-[0.14em] md:text-3xl">STATS</h1>

	<section
		class="grid grid-cols-2 border border-[#2a241b] sm:grid-cols-3 lg:grid-cols-6"
		aria-label="Totals"
	>
		{#each [{ v: formatNumber(data.summary.games), l: 'Games' }, { v: formatNumber(data.summary.perfected), l: 'Perfected' }, { v: `${data.summary.averageCompletion}%`, l: 'Avg completion' }, { v: formatNumber(data.summary.unlocks), l: 'Achievements' }, { v: formatNumber(hours), l: 'Hours played' }, { v: formatNumber(data.summary.backlog), l: 'Backlog' }] as stat (stat.l)}
			<div class="border-r border-b border-[#2a241b] px-4 py-3">
				<div class="font-display text-2xl tabular-nums">{stat.v}</div>
				<div class="label">{stat.l}</div>
			</div>
		{/each}
	</section>

	<div class="grid gap-8 lg:grid-cols-2">
		<section class="grid content-start gap-3" aria-labelledby="months-title">
			<h2 id="months-title" class="rule-title">Unlocks per month</h2>
			<div
				class="flex h-44 items-end gap-1.5 border-b border-rule pb-0"
				role="img"
				aria-label="Achievements unlocked in each of the last 12 months"
			>
				{#each data.months as m (m.month)}
					<div class="flex h-full flex-1 flex-col items-center justify-end gap-1">
						{#if m.count}<span class="font-mono text-[10px] text-dust tabular-nums">{m.count}</span
							>{/if}
						<div
							class="w-full bg-gradient-to-t from-[#8a5a1c] to-ember shadow-[0_0_10px_-2px_rgba(255,150,60,.5)]"
							style="height: {(m.count / maxMonth) * 85}%; min-height: {m.count ? 2 : 0}px"
						></div>
					</div>
				{/each}
			</div>
			<div class="flex gap-1.5">
				{#each data.months as m (m.month)}
					<span class="flex-1 text-center font-mono text-[10px] text-faint"
						>{monthLabel(m.month)}</span
					>
				{/each}
			</div>
		</section>

		<section class="grid content-start gap-3" aria-labelledby="bands-title">
			<h2 id="bands-title" class="rule-title">Games by completion</h2>
			<ul class="grid gap-2">
				{#each data.bands as band (band.label)}
					<li class="grid grid-cols-[64px_1fr_36px] items-center gap-3">
						<span class="font-mono text-xs text-dust">{band.label}</span>
						<span class="h-3 bg-[#1c1812]"
							><i
								class="block h-full {band.label === '100%' ? 'bg-gold' : 'bg-ember/80'}"
								style="width: {(band.count / maxBand) * 100}%"
							></i></span
						>
						<span class="text-right font-mono text-xs tabular-nums">{band.count}</span>
					</li>
				{/each}
			</ul>
		</section>

		<section class="grid content-start gap-2" aria-labelledby="rarest-title">
			<h2 id="rarest-title" class="rule-title">Rarest unlocks</h2>
			{#each data.rarest as unlock (unlock.achievementId)}
				<UnlockRow {unlock} />
			{:else}
				<p class="text-dust italic">Rarity comes from Steam: link your account to see it.</p>
			{/each}
		</section>

		<section class="grid content-start gap-3" aria-labelledby="played-title">
			<h2 id="played-title" class="rule-title">Most played</h2>
			<ul class="grid gap-2">
				{#each data.mostPlayed as item (item.game.id)}
					<li>
						<a
							href="/game/{item.game.id}"
							class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 hover:text-ember"
						>
							<span class="truncate text-[14px]">{item.game.name}</span>
							<span class="font-mono text-xs text-dust"
								>{formatPlaytime(item.entry.playtimeMinutes)}</span
							>
							<span class="col-span-2 h-1 bg-[#1c1812]"
								><i
									class="block h-full bg-soul/70"
									style="width: {(item.entry.playtimeMinutes / maxPlayed) * 100}%"
								></i></span
							>
						</a>
					</li>
				{:else}
					<li class="text-dust italic">No playtime yet.</li>
				{/each}
			</ul>
		</section>
	</div>
</main>
