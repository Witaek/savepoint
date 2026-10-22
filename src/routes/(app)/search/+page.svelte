<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Search } from '@lucide/svelte';
	import Cover from '$lib/components/Cover.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { STATUS_LABELS } from '$lib/games';
	import { toastResult } from '$lib/forms';

	let { data } = $props();
	let query = $state(page.url.searchParams.get('q') ?? '');
	let platform = $state<string>('Steam');
	let manualOpen = $state(false);

	// Search as you type, after a short pause.
	let timer: ReturnType<typeof setTimeout> | undefined;
	function oninput() {
		clearTimeout(timer);
		timer = setTimeout(() => {
			const q = query.trim();
			if (q === data.q) return;
			goto(q ? `/search?q=${encodeURIComponent(q)}` : '/search', {
				replaceState: true,
				keepFocus: true,
				noScroll: true
			});
		}, 350);
	}
</script>

<svelte:head><title>{data.q ? `${data.q} · ` : ''}Search · Savepoint</title></svelte:head>

<main
	class="mx-auto grid max-w-6xl gap-6 px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-10 md:px-8 md:pt-8"
>
	<PageHeader title="SEARCH" />

	<form
		method="GET"
		class="relative"
		role="search"
		onsubmit={(e) => {
			e.preventDefault();
			oninput();
		}}
	>
		<Search
			class="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-faint"
		/>
		<label class="sr-only" for="q">Search for a game</label>
		<input
			id="q"
			name="q"
			type="search"
			class="input !py-3 !pl-11 text-lg"
			placeholder="Elden Ring, Hollow Knight, Kingdom Hearts…"
			autocomplete="off"
			bind:value={query}
			{oninput}
		/>
	</form>
	<div class="-mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-dust">
		<span>
			{data.source === 'igdb'
				? 'Searching every platform (IGDB).'
				: 'Searching the Steam store. Add IGDB keys to search every platform.'}
		</span>
		<label class="flex items-center gap-2">
			<span class="label">Adding for</span>
			<select class="input !w-auto !py-1.5 text-sm" bind:value={platform}>
				{#each data.platforms as p (p)}<option value={p}>{p}</option>{/each}
			</select>
		</label>
	</div>

	{#if data.error}
		<p class="border border-blood/40 bg-blood/10 p-3 text-blood">{data.error}</p>
	{/if}

	{#if data.results.length}
		<!-- A list on phones (small cover beside the name), a grid of covers on wider screens. -->
		<ul class="grid gap-3 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-6 md:grid-cols-4 lg:grid-cols-5">
			{#each data.results as result, i (result.key)}
				{@const owned = data.inLibrary[result.key]}
				<li
					class="grid grid-cols-[4.5rem_minmax(0,1fr)] content-start gap-x-3 gap-y-2 border-b border-[#1d1912] pb-3 sm:grid-cols-1 sm:border-0 sm:pb-0"
				>
					<Cover
						game={{ id: i, name: result.name, cover: result.cover, steamAppId: result.steamAppId }}
						href={owned ? `/game/${owned.gameId}` : undefined}
						eager={i < 5}
					/>
					<div class="self-center sm:self-auto">
						<p class="font-display text-[13px] leading-snug tracking-[0.04em]">{result.name}</p>
						<p class="font-mono text-[10.5px] text-dust">
							{[result.year, result.platforms.slice(0, 4).join(' · ')].filter(Boolean).join(' · ')}
						</p>
					</div>
					{#if owned}
						<a
							href="/game/{owned.gameId}"
							class="label col-span-2 flex min-h-10 items-center !text-ember sm:col-span-1"
							>In library · {STATUS_LABELS[owned.status]} →</a
						>
					{:else}
						<form
							method="POST"
							action="?/add"
							use:enhance={toastResult()}
							class="col-span-2 grid grid-cols-2 gap-1.5 sm:col-span-1 sm:flex sm:flex-wrap"
						>
							<input type="hidden" name="key" value={result.key} />
							<input type="hidden" name="name" value={result.name} />
							<input type="hidden" name="platform" value={platform} />
							<button class="chip hover:!border-ember hover:!text-ash" name="status" value="playing"
								>Playing</button
							>
							<button class="chip hover:!border-ember hover:!text-ash" name="status" value="backlog"
								>Backlog</button
							>
							<button class="chip hover:!border-ember hover:!text-ash" name="status" value="beaten"
								>Beaten</button
							>
							<button
								class="chip hover:!border-ember hover:!text-ash"
								name="status"
								value="wishlist">Wishlist</button
							>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{:else if data.q.length >= 2 && !data.error}
		<p class="py-6 text-dust italic">No game called "{data.q}" was found.</p>
	{/if}

	<section class="panel grid gap-3 p-4">
		<button
			class="rule-title min-h-10 text-left"
			onclick={() => (manualOpen = !manualOpen)}
			aria-expanded={manualOpen}
		>
			Add a game by hand
		</button>
		{#if manualOpen}
			<p class="text-sm text-dust">
				For anything search doesn't know. You can add a checklist to it afterwards.
			</p>
			<form
				method="POST"
				action="?/manual"
				use:enhance
				class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-end"
			>
				<div class="grid gap-1.5">
					<label class="label" for="manual-name">Name</label>
					<input
						id="manual-name"
						name="name"
						class="input"
						required
						maxlength="200"
						value={data.q}
					/>
				</div>
				<div class="grid gap-1.5">
					<label class="label" for="manual-platform">Platform</label>
					<select id="manual-platform" name="platform" class="input !w-auto" value={platform}>
						{#each data.platforms as p (p)}<option value={p}>{p}</option>{/each}
					</select>
				</div>
				<div class="grid gap-1.5">
					<label class="label" for="manual-status">Status</label>
					<select id="manual-status" name="status" class="input !w-auto">
						<option value="playing">Playing</option>
						<option value="backlog">Backlog</option>
						<option value="beaten">Beaten</option>
						<option value="wishlist">Wishlist</option>
					</select>
				</div>
				<button class="btn">Add</button>
			</form>
		{/if}
	</section>
</main>
