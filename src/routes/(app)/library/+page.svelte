<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Cover from '$lib/components/Cover.svelte';
	import EmberBar from '$lib/components/EmberBar.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import {
		GAME_STATUSES,
		STATUS_HINTS,
		STATUS_LABELS,
		formatPlaytime,
		isGameStatus,
		isPerfect,
		percent,
		type GameStatus
	} from '$lib/games';
	import { formatDate, relativeTime } from '$lib/format';

	let { data } = $props();

	const SORTS = {
		played: 'Recently played',
		completion: 'Closest to 100%',
		name: 'Name',
		playtime: 'Most played',
		added: 'Recently added'
	} as const;
	type Sort = keyof typeof SORTS;

	const params = $derived(page.url.searchParams);
	const status = $derived.by(() => {
		const s = params.get('status');
		return s === 'perfected' || isGameStatus(s) ? s : 'all';
	});
	const sort = $derived(
		(params.get('sort') as Sort) in SORTS ? (params.get('sort') as Sort) : 'played'
	);
	let query = $state(page.url.searchParams.get('q') ?? '');

	function setParam(key: string, value: string | null) {
		const url = new URL(page.url);
		if (value) url.searchParams.set(key, value);
		else url.searchParams.delete(key);
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}

	const time = (d: Date | null) => d?.getTime() ?? 0;
	const items = $derived.by(() => {
		const q = query.trim().toLowerCase();
		const list = data.items.filter(
			(i) =>
				(status === 'all'
					? i.entry.status !== 'wishlist'
					: status === 'perfected'
						? isPerfect(i.progress)
						: i.entry.status === status) &&
				(!q || i.game.name.toLowerCase().includes(q))
		);
		// Closest to 100%: unfinished games by completion, then perfected ones, then games
		// without achievements.
		const rank = (i: (typeof list)[0]) =>
			i.progress.total === 0 ? -2 : isPerfect(i.progress) ? -1 : percent(i.progress);
		const by: Record<Sort, (a: (typeof list)[0], b: (typeof list)[0]) => number> = {
			played: (a, b) => time(b.entry.lastPlayedAt) - time(a.entry.lastPlayedAt),
			completion: (a, b) => rank(b) - rank(a),
			name: () => 0,
			playtime: (a, b) => b.entry.playtimeMinutes - a.entry.playtimeMinutes,
			added: (a, b) => b.entry.addedAt.getTime() - a.entry.addedAt.getTime()
		};
		// Stable sort: ties keep the server's alphabetical order.
		return [...list].sort(by[sort]);
	});
	const perfectedCount = $derived(data.items.filter((i) => isPerfect(i.progress)).length);

	let selectedId = $state<number | null>(null);
	const selected = $derived(items.find((i) => i.game.id === selectedId) ?? items[0] ?? null);

	const TRIAGE: GameStatus[] = ['backlog', 'playing', 'beaten', 'abandoned'];
</script>

<svelte:head><title>Library · Savepoint</title></svelte:head>

<main
	class="mx-auto grid max-w-7xl gap-5 px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-10 md:px-8 md:pt-8"
>
	<PageHeader title="LIBRARY" />
	<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:max-w-xl">
		<label class="sr-only" for="library-filter">Filter by name</label>
		<input
			id="library-filter"
			type="search"
			class="input !py-2 text-sm"
			placeholder="Filter by name"
			bind:value={query}
		/>
		<label class="sr-only" for="library-sort">Sort</label>
		<select
			id="library-sort"
			class="input !w-auto !py-2 text-sm"
			value={sort}
			onchange={(e) =>
				setParam('sort', e.currentTarget.value === 'played' ? null : e.currentTarget.value)}
		>
			{#each Object.entries(SORTS) as [value, label] (value)}
				<option {value}>{label}</option>
			{/each}
		</select>
	</div>

	<!-- On phones the statuses scroll sideways; the fade on the right says there are more. -->
	<nav
		class="chip-scroller -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0"
		aria-label="Status"
	>
		<button class="chip" aria-pressed={status === 'all'} onclick={() => setParam('status', null)}
			>All <span class="n">{data.counts.all - data.counts.wishlist}</span></button
		>
		{#each GAME_STATUSES as s (s)}
			{#if data.counts[s] > 0 || s === 'playing' || s === 'backlog'}
				<button
					class="chip"
					aria-pressed={status === s}
					title={STATUS_HINTS[s]}
					onclick={() => setParam('status', s)}
					>{STATUS_LABELS[s]} <span class="n">{data.counts[s]}</span></button
				>
			{/if}
		{/each}
		<button
			class="chip"
			aria-pressed={status === 'perfected'}
			onclick={() => setParam('status', 'perfected')}
			>100% <span class="n">{perfectedCount}</span></button
		>
	</nav>

	{#if data.items.length === 0}
		<div class="panel grid gap-3 p-6">
			<p class="text-dust">Your library is empty.</p>
			<div class="flex flex-wrap gap-3">
				<a href="/settings#steam" class="btn">Link Steam</a>
				<a href="/search" class="btn btn-ghost">Add a game</a>
			</div>
		</div>
	{:else if items.length === 0}
		<p class="py-10 text-center text-dust italic">Nothing here.</p>
	{:else if status === 'unsorted'}
		<p class="text-sm text-dust">
			Imported from Steam with some playtime. Sort each one in a tap; it leaves this list.
		</p>
		<ul class="grid gap-2">
			{#each items as item (item.game.id)}
				<li
					class="panel grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-3 p-2.5 sm:grid-cols-[3rem_minmax(0,1fr)_auto]"
				>
					<Cover game={item.game} href="/game/{item.game.id}" />
					<div class="min-w-0">
						<a
							href="/game/{item.game.id}"
							class="block truncate py-1 font-display text-sm tracking-[0.05em]">{item.game.name}</a
						>
						<p class="font-mono text-[11px] text-dust">
							{formatPlaytime(item.entry.playtimeMinutes)}{item.entry.lastPlayedAt
								? ` · last played ${relativeTime(item.entry.lastPlayedAt)}`
								: ''}{item.progress.total
								? ` · ${item.progress.unlocked}/${item.progress.total}`
								: ''}
						</p>
					</div>
					<!-- 2 × 2 on phones, under the name; in one row next to it on wider screens. -->
					<form
						method="POST"
						action="?/status"
						use:enhance
						class="col-span-2 grid grid-cols-2 gap-1.5 sm:col-span-1 sm:flex"
					>
						<input type="hidden" name="gameId" value={item.game.id} />
						{#each TRIAGE as s (s)}
							<button class="chip hover:!border-ember hover:!text-ash" name="status" value={s}
								>{STATUS_LABELS[s]}</button
							>
						{/each}
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_270px]">
			<ul class="grid grid-cols-3 content-start gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
				{#each items as item, i (item.game.id)}
					<li
						onmouseenter={() => (selectedId = item.game.id)}
						onfocusin={() => (selectedId = item.game.id)}
					>
						<Cover
							game={item.game}
							progress={item.progress}
							platform={item.entry.platform}
							href="/game/{item.game.id}"
							eager={i < 12}
						/>
						<p class="mt-1.5 truncate text-[13px] text-dust lg:hidden">{item.game.name}</p>
					</li>
				{/each}
			</ul>
			{#if selected}
				<aside
					class="panel sticky top-6 hidden content-start gap-3 self-start p-4 lg:grid"
					aria-live="polite"
				>
					<span class="label !text-ember">{STATUS_LABELS[selected.entry.status]}</span>
					<h2
						class="font-display text-[15px] leading-snug tracking-[0.1em] text-[#f3e6c4] uppercase"
					>
						{selected.game.name}
					</h2>
					<dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px]">
						{#if selected.progress.total}
							<dt class="label pt-0.5">Achievements</dt>
							<dd class="text-right tabular-nums">
								{selected.progress.unlocked} / {selected.progress.total}
							</dd>
						{/if}
						<dt class="label pt-0.5">Playtime</dt>
						<dd class="text-right">{formatPlaytime(selected.entry.playtimeMinutes)}</dd>
						{#if selected.entry.lastPlayedAt}
							<dt class="label pt-0.5">Last played</dt>
							<dd class="text-right">{relativeTime(selected.entry.lastPlayedAt)}</dd>
						{/if}
						{#if selected.entry.platform}
							<dt class="label pt-0.5">Platform</dt>
							<dd class="text-right">{selected.entry.platform}</dd>
						{/if}
						{#if selected.entry.perfectedAt}
							<dt class="label pt-0.5">Perfected</dt>
							<dd class="text-right text-gold">{formatDate(selected.entry.perfectedAt)}</dd>
						{/if}
						{#if selected.game.releaseDate}
							<dt class="label pt-0.5">Released</dt>
							<dd class="text-right">{selected.game.releaseDate.slice(0, 4)}</dd>
						{/if}
					</dl>
					{#if selected.progress.total}
						<EmberBar
							value={percent(selected.progress)}
							gold={isPerfect(selected.progress)}
							label="Achievements"
						/>
					{/if}
					<a href="/game/{selected.game.id}" class="btn mt-1">Open</a>
				</aside>
			{/if}
		</div>
	{/if}
</main>
