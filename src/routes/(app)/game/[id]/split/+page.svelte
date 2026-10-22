<script lang="ts">
	import { enhance } from '$app/forms';
	import { ArrowDown, ArrowUp, ChevronLeft, Download, Trash2 } from '@lucide/svelte';
	import { toastResult } from '$lib/forms';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	type Filter = 'unplaced' | 'all' | number;
	const unplacedCount = $derived(data.achievements.filter((a) => a.groupId === null).length);
	// Until a filter is picked, show what still needs a home (once there are groups).
	let picked = $state<Filter | null>(null);
	const filter = $derived<Filter>(
		picked ?? (data.groups.length && unplacedCount ? 'unplaced' : 'all')
	);
	const shown = $derived(
		data.achievements.filter((a) =>
			filter === 'all' ? true : filter === 'unplaced' ? a.groupId === null : a.groupId === filter
		)
	);

	let selected = $state(new Set<number>());
	// The bar for moving the selection sits where toasts appear: clear them out of its way.
	const toggle = (id: number) => {
		toast.dismiss();
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	};
	const selectShown = () => {
		toast.dismiss();
		selected = new Set(shown.map((a) => a.id));
	};
	let revealed = $state(new Set<number>());

	const groupName = (id: number | null) =>
		id === null ? 'No group' : (data.groups.find((g) => g.id === id)?.name ?? '?');

	let ruleType = $state<'prefix' | 'range' | 'contains'>('prefix');
	let removeAll = $state(false);
	let deleting = $state<number | null>(null);
	let importOpen = $state(false);

	// Suggested names: IGDB's list when it has exactly one name per prefix found.
	const suggestedName = (i: number, prefix: string) =>
		data.suggestion.names.length === data.suggestion.prefixes.length
			? data.suggestion.names[i]
			: prefix.replace(/_$/, '');
	const afterMove = toastResult({ onDone: () => (selected = new Set()) });
</script>

<svelte:head><title>Split · {data.game.name} · Savepoint</title></svelte:head>

<datalist id="bundle-names">
	{#each data.suggestion.names as name (name)}<option value={name}></option>{/each}
</datalist>

<main
	class="mx-auto grid max-w-4xl gap-8 px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-32 md:px-8 md:pt-8"
>
	<a
		href="/game/{data.game.id}"
		class="label -my-3 -ml-1 flex h-11 items-center gap-1 justify-self-start pr-3 hover:!text-ash"
		><ChevronLeft class="size-4" /> {data.game.name}</a
	>
	<header class="grid gap-2">
		<h1 class="font-display text-[clamp(1.3rem,5.5vw,2rem)] tracking-[0.1em]">SPLIT INTO GAMES</h1>
		<p class="max-w-prose text-dust">
			Steam gives a collection one list of achievements. Make a group for each game in it (or each
			DLC), and Savepoint shows a progress bar for each. Rules place achievements in bulk; move the
			rest by hand. Everyone on this server shares the split.
		</p>
	</header>

	<!-- Suggestion from the API names -->
	{#if data.suggestion.prefixes.length && data.groups.length === 0}
		<section
			class="grid gap-3 border border-ember-dim bg-gradient-to-r from-ember/10 to-transparent p-4"
		>
			<h2 class="rule-title !text-ember">Suggested from the API names</h2>
			<p class="text-sm text-dust">
				The achievements' API names start with {data.suggestion.prefixes.length} different prefixes, which
				usually means one per game. Name each group (leave one empty to skip it).
			</p>
			<form method="POST" action="?/suggestion" use:enhance={toastResult()} class="grid gap-2">
				{#each data.suggestion.prefixes as p, i (p.prefix)}
					<div class="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-3">
						<span class="font-mono text-xs"
							>{p.prefix}… <span class="text-dust">({p.count})</span></span
						>
						<input type="hidden" name="prefix" value={p.prefix} />
						<label class="sr-only" for="suggest-{i}">Name for {p.prefix}</label>
						<input
							id="suggest-{i}"
							name="name"
							class="input"
							list="bundle-names"
							value={suggestedName(i, p.prefix)}
						/>
					</div>
				{/each}
				<button class="btn mt-1 sm:justify-self-start">Create these groups</button>
			</form>
		</section>
	{/if}

	<!-- Groups -->
	<section class="grid gap-3" aria-labelledby="groups-title">
		<h2 id="groups-title" class="rule-title">Groups</h2>
		{#if data.groups.length === 0}
			<p class="text-sm text-dust">
				No groups yet.{data.suggestion.names.length
					? ` IGDB says this collection contains ${data.suggestion.names.join(', ')}.`
					: ''}
			</p>
		{/if}
		<ul class="grid gap-2">
			{#each data.groups as group, i (group.id)}
				<li class="panel grid gap-2 p-3">
					<form
						method="POST"
						action="?/updateGroup"
						use:enhance={toastResult({ quiet: true })}
						class="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
					>
						<input type="hidden" name="groupId" value={group.id} />
						<label class="sr-only" for="group-name-{group.id}">Name</label>
						<input
							id="group-name-{group.id}"
							name="name"
							class="input"
							list="bundle-names"
							value={group.name}
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
						/>
						<label class="sr-only" for="group-kind-{group.id}">Kind</label>
						<select
							id="group-kind-{group.id}"
							name="kind"
							class="input !w-auto"
							value={group.kind}
							onchange={(e) => e.currentTarget.form?.requestSubmit()}
						>
							<option value="game">Game</option>
							<option value="dlc">DLC</option>
						</select>
					</form>
					<div class="flex items-center gap-1">
						<button
							class="chip"
							aria-pressed={filter === group.id}
							onclick={() => (picked = group.id)}>{group.count} achievements</button
						>
						<span class="flex-1"></span>
						{#each [['up', ArrowUp, i === 0], ['down', ArrowDown, i === data.groups.length - 1]] as const as [direction, Icon, disabled] (direction)}
							<form method="POST" action="?/moveGroup" use:enhance>
								<input type="hidden" name="groupId" value={group.id} />
								<button
									class="grid size-10 place-items-center text-dust hover:text-ash disabled:opacity-30"
									name="direction"
									value={direction}
									{disabled}
									aria-label="Move {group.name} {direction}"><Icon class="size-4" /></button
								>
							</form>
						{/each}
						{#if deleting === group.id}
							<form method="POST" action="?/deleteGroup" use:enhance={toastResult()}>
								<input type="hidden" name="groupId" value={group.id} />
								<button class="btn btn-danger">Remove</button>
							</form>
						{:else}
							<button
								class="grid size-10 place-items-center text-faint hover:text-blood"
								onclick={() => (deleting = group.id)}
								aria-label="Remove {group.name}"><Trash2 class="size-4" /></button
							>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
		<form
			method="POST"
			action="?/createGroup"
			use:enhance={toastResult({ reset: true })}
			class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
		>
			<label class="sr-only" for="new-group">New group</label>
			<input
				id="new-group"
				name="name"
				class="input"
				list="bundle-names"
				placeholder="Kingdom Hearts II Final Mix"
				required
			/>
			<label class="sr-only" for="new-kind">Kind</label>
			<select id="new-kind" name="kind" class="input !w-auto">
				<option value="game">Game</option>
				<option value="dlc">DLC</option>
			</select>
			<button class="btn col-span-2 sm:col-span-1">Add group</button>
		</form>
	</section>

	<!-- Rules -->
	{#if data.groups.length}
		<section class="grid gap-3" aria-labelledby="rules-title">
			<h2 id="rules-title" class="rule-title">Rules</h2>
			<p class="text-sm text-dust">
				Tried in this order on every achievement; the first that matches decides its group.
			</p>
			{#if data.rules.length}
				<ol class="grid gap-1">
					{#each data.rules as rule, i (rule.id)}
						<li class="panel flex items-center gap-3 py-1 pr-1 pl-3">
							<span class="font-mono text-xs text-faint">{i + 1}</span>
							<span class="min-w-0 flex-1 text-sm"
								>{rule.label} <span class="text-dust">→</span>
								<span class="text-ember">{rule.groupName}</span></span
							>
							<form method="POST" action="?/deleteRule" use:enhance={toastResult()}>
								<input type="hidden" name="ruleId" value={rule.id} />
								<button
									class="grid size-10 place-items-center text-faint hover:text-blood"
									aria-label="Remove rule {i + 1}"><Trash2 class="size-4" /></button
								>
							</form>
						</li>
					{/each}
				</ol>
			{/if}
			<form
				method="POST"
				action="?/addRule"
				use:enhance={toastResult({ reset: true })}
				class="panel grid gap-3 p-3"
			>
				<div class="grid gap-1.5">
					<label class="label" for="rule-type">When</label>
					<select id="rule-type" name="type" class="input" bind:value={ruleType}>
						<option value="prefix">The API name starts with…</option>
						<option value="range">Its position in Steam's list is from… to…</option>
						<option value="contains">Its name or description contains…</option>
					</select>
				</div>
				{#if ruleType === 'range'}
					<div class="grid grid-cols-2 gap-2">
						<div class="grid gap-1.5">
							<label class="label" for="rule-from">From</label>
							<input id="rule-from" name="from" type="number" min="1" class="input" required />
						</div>
						<div class="grid gap-1.5">
							<label class="label" for="rule-to">To</label>
							<input
								id="rule-to"
								name="to"
								type="number"
								min="1"
								max={data.achievements.length}
								class="input"
								required
							/>
						</div>
					</div>
				{:else}
					<div class="grid gap-1.5">
						<label class="label" for="rule-value"
							>{ruleType === 'prefix' ? 'Starts with' : 'Contains'}</label
						>
						<input
							id="rule-value"
							name="value"
							class="input {ruleType === 'prefix' ? 'font-mono' : ''}"
							placeholder={ruleType === 'prefix' ? 'KH2_' : 'Aqua'}
							autocapitalize="none"
							required
						/>
					</div>
				{/if}
				<div class="grid gap-1.5">
					<label class="label" for="rule-group">Put it in</label>
					<select id="rule-group" name="groupId" class="input">
						{#each data.groups as group (group.id)}<option value={group.id}>{group.name}</option
							>{/each}
					</select>
				</div>
				<button class="btn sm:justify-self-start">Add rule</button>
			</form>
		</section>
	{/if}

	<!-- Achievements -->
	<section class="grid gap-3" aria-labelledby="list-title">
		<h2 id="list-title" class="rule-title">Achievements · {data.achievements.length}</h2>
		<nav
			class="chip-scroller -mx-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0"
			aria-label="Show"
		>
			<button class="chip" aria-pressed={filter === 'all'} onclick={() => (picked = 'all')}
				>All <span class="n">{data.achievements.length}</span></button
			>
			{#if data.groups.length}
				<button
					class="chip"
					aria-pressed={filter === 'unplaced'}
					onclick={() => (picked = 'unplaced')}
					>No group <span class="n">{unplacedCount}</span></button
				>
				{#each data.groups as group (group.id)}
					<button
						class="chip"
						aria-pressed={filter === group.id}
						onclick={() => (picked = group.id)}
						>{group.name} <span class="n">{group.count}</span></button
					>
				{/each}
			{/if}
		</nav>
		{#if data.groups.length && shown.length}
			<button class="label justify-self-start hover:!text-ash" onclick={selectShown}
				>Select these {shown.length}</button
			>
		{/if}
		<ul class="border border-[#2a241b]">
			{#each shown as a (a.id)}
				{@const hidden = a.hidden && !revealed.has(a.id)}
				<li class="border-b border-[#1d1912] last:border-b-0">
					<label
						class="grid cursor-pointer grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 {selected.has(
							a.id
						)
							? 'bg-ember/10'
							: ''}"
					>
						<span class="font-mono text-[11px] text-faint tabular-nums">{a.sortOrder + 1}</span>
						<span class="min-w-0">
							<span class="block truncate font-display text-[13px] tracking-[0.04em]">
								{#if hidden}
									<button
										type="button"
										class="text-dust italic underline decoration-dotted"
										onclick={(e) => {
											e.preventDefault();
											revealed = new Set([...revealed, a.id]);
										}}>Hidden achievement · show</button
									>
								{:else}{a.name}{/if}
							</span>
							<span class="block truncate font-mono text-[11px] text-dust"
								>{a.key} · {groupName(a.groupId)}{a.groupManual ? ' (by hand)' : ''}</span
							>
						</span>
						{#if data.groups.length}
							<input
								type="checkbox"
								class="size-5 accent-[#e3a54b]"
								checked={selected.has(a.id)}
								onchange={() => toggle(a.id)}
								aria-label="Select {hidden ? 'hidden achievement' : a.name}"
							/>
						{/if}
					</label>
				</li>
			{:else}
				<li class="p-4 text-center text-dust italic">Nothing here.</li>
			{/each}
		</ul>
	</section>

	<!-- Share -->
	<section class="grid gap-3" aria-labelledby="share-title">
		<h2 id="share-title" class="rule-title">Share</h2>
		<p class="text-sm text-dust">
			A split is a small file. Download it to keep it, to use it on another server, or to add it to
			Savepoint so this collection splits itself for everyone (<span class="font-mono text-xs"
				>src/lib/server/splits/{data.game.steamAppId ?? 'app-id'}.json</span
			>).
		</p>
		<div class="flex flex-wrap gap-2">
			{#if data.groups.length}
				<a href="/api/games/{data.game.id}/split" class="btn btn-ghost" data-sveltekit-reload
					><Download class="size-4" /> Download</a
				>
			{/if}
			<button class="btn btn-ghost" onclick={() => (importOpen = !importOpen)}>Import a file</button
			>
		</div>
		{#if importOpen}
			<form
				method="POST"
				action="?/import"
				use:enhance={toastResult({ reset: true })}
				class="grid gap-2"
			>
				<label class="label" for="import-file"
					>Paste the file's contents (replaces this split)</label
				>
				<textarea id="import-file" name="file" rows="6" class="input font-mono text-xs" required
				></textarea>
				<button class="btn sm:justify-self-start">Import</button>
			</form>
		{/if}
		{#if data.groups.length}
			{#if removeAll}
				<form method="POST" action="?/clear" use:enhance={toastResult()}>
					<button class="btn btn-danger">Remove every group and rule</button>
				</form>
			{:else}
				<button
					class="label justify-self-start !text-blood/80 hover:!text-blood"
					onclick={() => (removeAll = true)}>Remove the split…</button
				>
			{/if}
		{/if}
	</section>
</main>

<!-- Moving the selection: a bar above the tab bar, so it's at hand on a phone. -->
{#if selected.size}
	<form
		method="POST"
		action="?/assign"
		use:enhance={afterMove}
		class="fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 border-t border-ember-dim bg-[#15120d]/95 px-4 py-3 backdrop-blur lg:bottom-0 lg:left-56"
	>
		{#each [...selected] as id (id)}<input type="hidden" name="ids" value={id} />{/each}
		<div class="mx-auto grid max-w-4xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
			<span class="font-mono text-xs text-ember">{selected.size} selected</span>
			<label class="sr-only" for="move-target">Move to</label>
			<select id="move-target" name="target" class="input">
				{#each data.groups as group (group.id)}<option value={group.id}>{group.name}</option>{/each}
				<option value="rules">Back to the rules</option>
				<option value="none">No group</option>
			</select>
			<button class="btn">Move</button>
		</div>
		<button
			type="button"
			class="label mx-auto mt-1 block hover:!text-ash"
			onclick={() => (selected = new Set())}>Clear selection</button
		>
	</form>
{/if}
