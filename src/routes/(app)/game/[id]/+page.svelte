<script lang="ts">
	import { enhance } from '$app/forms';
	import { Check, Eye, RefreshCw, Trash2 } from '@lucide/svelte';
	import AchievementIcon from '$lib/components/AchievementIcon.svelte';
	import Cover from '$lib/components/Cover.svelte';
	import EmberBar from '$lib/components/EmberBar.svelte';
	import Rarity from '$lib/components/Rarity.svelte';
	import Ring from '$lib/components/Ring.svelte';
	import {
		GAME_STATUSES,
		STATUS_LABELS,
		formatPlaytime,
		isPerfect,
		percent,
		steamImage
	} from '$lib/games';
	import { formatDate, relativeTime } from '$lib/format';
	import { toastResult } from '$lib/forms';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	const game = $derived(data.game);
	const entry = $derived(data.entry);

	type Filter = 'all' | 'locked' | 'unlocked';
	let filter = $state<Filter>('all');
	let revealed = $state(new Set<number>());

	const steamList = $derived(data.achievements.filter((a) => a.source === 'steam'));
	const checklist = $derived(data.achievements.filter((a) => a.source === 'custom'));
	const shown = $derived.by(() => {
		const keep = (a: (typeof data.achievements)[0]) =>
			filter === 'all' ? true : filter === 'locked' ? !a.unlockedAt : Boolean(a.unlockedAt);
		// Locked first, so what's left is at the top.
		return steamList
			.filter(keep)
			.sort((a, b) => Number(Boolean(a.unlockedAt)) - Number(Boolean(b.unlockedAt)));
	});
	const steamProgress = $derived({
		unlocked: steamList.filter((a) => a.unlockedAt).length,
		total: steamList.length
	});
	const checklistDone = $derived(checklist.filter((a) => a.unlockedAt).length);

	let heroFailed = $state(false);
	const heroSrc = $derived(
		heroFailed ? null : (game.hero ?? (game.steamAppId ? steamImage.hero(game.steamAppId) : null))
	);
	const isHidden = (a: { id: number; hidden: boolean; unlockedAt: Date | null }) =>
		a.hidden && !a.unlockedAt && !data.showHidden && !revealed.has(a.id);

	let syncing = $state(false);
	let addingItem = $state(false);
	let removeConfirm = $state(false);
</script>

<svelte:head><title>{game.name} · Savepoint</title></svelte:head>

<div class="relative">
	<div class="absolute inset-x-0 top-0 -z-10 h-80 overflow-hidden md:h-96">
		{#if heroSrc}
			<img
				src={heroSrc}
				alt=""
				class="size-full object-cover opacity-35"
				onerror={() => (heroFailed = true)}
			/>
		{/if}
		<div class="absolute inset-0 bg-gradient-to-b from-abyss/40 via-abyss/80 to-abyss"></div>
	</div>

	<main
		class="mx-auto grid max-w-5xl gap-7 px-4 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-12 md:px-8 md:pt-14"
	>
		<header
			class="grid grid-cols-[96px_1fr] items-end gap-4 sm:grid-cols-[132px_1fr_auto] md:gap-6"
		>
			<Cover {game} progress={data.progress.total ? data.progress : null} eager />
			<div class="grid min-w-0 gap-1.5">
				{#if entry}
					<span class="label !text-ember"
						>{STATUS_LABELS[entry.status]}{entry.platform ? ` · ${entry.platform}` : ''}</span
					>
				{/if}
				<h1
					class="font-display text-2xl leading-tight font-bold tracking-[0.08em] text-[#f3e6c4] uppercase md:text-[2rem]"
				>
					{game.name}
				</h1>
				<p class="font-mono text-xs text-dust">
					{[
						game.developers.slice(0, 2).join(', '),
						game.releaseDate?.slice(0, 4),
						entry ? formatPlaytime(entry.playtimeMinutes) : null,
						entry?.lastPlayedAt ? `last played ${relativeTime(entry.lastPlayedAt)}` : null
					]
						.filter(Boolean)
						.join(' · ')}
				</p>
			</div>
			{#if data.progress.total}
				<div class="hidden sm:block">
					<Ring
						value={percent(data.progress)}
						label={isPerfect(data.progress) ? 'Perfected' : 'Complete'}
					/>
				</div>
			{/if}
		</header>

		{#if game.summary}
			<p class="max-w-prose text-dust italic">{game.summary}</p>
		{/if}

		<!-- Library controls -->
		{#if entry}
			<section class="panel grid gap-4 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
				<form
					method="POST"
					action="?/update"
					use:enhance={toastResult({ quiet: true })}
					class="grid gap-1.5"
				>
					<label class="label" for="status">Status</label>
					<select
						id="status"
						name="status"
						class="input"
						value={entry.status}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					>
						{#each GAME_STATUSES as s (s)}<option value={s}>{STATUS_LABELS[s]}</option>{/each}
					</select>
				</form>
				<form
					method="POST"
					action="?/update"
					use:enhance={toastResult({ quiet: true })}
					class="grid gap-1.5"
				>
					<label class="label" for="platform">Platform</label>
					<select
						id="platform"
						name="platform"
						class="input"
						value={entry.platform ?? ''}
						onchange={(e) => e.currentTarget.form?.requestSubmit()}
					>
						<option value="">Not set</option>
						{#each data.platforms as p (p)}<option value={p}>{p}</option>{/each}
						{#if entry.platform && !data.platforms.includes(entry.platform as never)}<option
								value={entry.platform}>{entry.platform}</option
							>{/if}
					</select>
				</form>
				<div class="flex flex-wrap gap-2">
					{#if data.canSync}
						<form
							method="POST"
							action="?/sync"
							use:enhance={() => {
								syncing = true;
								return async ({ result, update }) => {
									syncing = false;
									const data = (
										result.type === 'success' || result.type === 'failure' ? result.data : null
									) as { ok?: string; error?: string } | null;
									if (data?.ok) toast.success(data.ok);
									if (data?.error) toast.error(data.error);
									await update({ reset: false });
								};
							}}
						>
							<button
								class="btn btn-ghost"
								disabled={syncing}
								title="Read this game's achievements from Steam now"
							>
								<RefreshCw class="size-3.5 {syncing ? 'animate-spin' : ''}" /> Sync
							</button>
						</form>
					{/if}
					{#if removeConfirm}
						<form method="POST" action="?/remove" use:enhance>
							<button class="btn btn-danger">Remove for good</button>
						</form>
					{:else}
						<button
							class="btn btn-ghost"
							onclick={() => (removeConfirm = true)}
							aria-label="Remove from library"><Trash2 class="size-3.5" /></button
						>
					{/if}
				</div>
				{#if entry.perfectedAt}
					<p class="text-sm text-gold md:col-span-3">
						Perfected {formatDate(entry.perfectedAt)}. It's in your Hall of Fame.
					</p>
				{/if}
			</section>
		{:else}
			<section class="panel grid gap-3 p-4">
				<h2 class="rule-title">Not in your library</h2>
				<form
					method="POST"
					action="?/add"
					use:enhance={toastResult()}
					class="flex flex-wrap items-end gap-3"
				>
					<div class="grid gap-1.5">
						<label class="label" for="add-platform">Platform</label>
						<select id="add-platform" name="platform" class="input !w-auto">
							{#each data.platforms as p (p)}<option value={p}>{p}</option>{/each}
						</select>
					</div>
					<button class="btn" name="status" value="playing">Playing</button>
					<button class="btn btn-ghost" name="status" value="backlog">Backlog</button>
					<button class="btn btn-ghost" name="status" value="beaten">Beaten</button>
					<button class="btn btn-ghost" name="status" value="wishlist">Wishlist</button>
				</form>
			</section>
		{/if}

		<!-- Achievements -->
		{#if steamList.length}
			<section class="grid gap-3" aria-labelledby="ach-title">
				<div class="flex flex-wrap items-center gap-3">
					<h2 id="ach-title" class="rule-title flex-1">
						Achievements · {steamProgress.unlocked} / {steamProgress.total}
					</h2>
					<div class="flex gap-1.5" role="group" aria-label="Show">
						{#each [['all', 'All'], ['locked', 'Locked'], ['unlocked', 'Unlocked']] as [value, label] (value)}
							<button
								class="chip"
								aria-pressed={filter === value}
								onclick={() => (filter = value as Filter)}>{label}</button
							>
						{/each}
					</div>
				</div>
				<EmberBar
					value={percent(steamProgress)}
					gold={isPerfect(steamProgress)}
					label="Achievements"
				/>
				{#if entry && !entry.steamOwned}
					<p class="text-sm text-dust">
						You don't own this on your linked Steam account, so tick achievements yourself as you
						earn them.
					</p>
				{/if}
				<ul class="border border-[#2a241b]">
					{#each shown as a (a.id)}
						{@const hidden = isHidden(a)}
						<li
							class="grid grid-cols-[44px_1fr_auto] items-center gap-3 border-b border-[#1d1912] px-3 py-2.5 last:border-b-0 sm:grid-cols-[44px_1fr_110px_auto] {a.unlockedAt
								? 'bg-gradient-to-r from-ember/[0.06] to-transparent'
								: ''}"
						>
							<AchievementIcon
								src={a.unlockedAt ? a.icon : (a.iconLocked ?? a.icon)}
								locked={!a.unlockedAt}
								size={44}
							/>
							<div class="min-w-0">
								<p
									class="font-display text-[13px] tracking-[0.04em] {hidden
										? 'blur-[5px] select-none'
										: ''}"
									aria-hidden={hidden}
								>
									{a.name}
								</p>
								<p
									class="text-[13.5px] leading-snug text-dust {hidden
										? 'blur-[5px] select-none'
										: ''}"
									aria-hidden={hidden}
								>
									{a.description ?? (a.hidden ? 'Hidden achievement' : '')}
								</p>
								{#if hidden}
									<button
										class="label mt-1 inline-flex items-center gap-1 border border-dashed border-[#4a3f2e] px-2 py-0.5 hover:!text-ash"
										onclick={() => (revealed = new Set([...revealed, a.id]))}
										><Eye class="size-3" /> Reveal hidden achievement</button
									>
								{/if}
							</div>
							<div class="hidden sm:grid sm:gap-1">
								{#if a.globalPercent !== null}
									<Rarity value={a.globalPercent} />
									<span class="h-[3px] bg-[#1c1812]"
										><i class="block h-full bg-soul/70" style="width: {a.globalPercent}%"></i></span
									>
								{/if}
							</div>
							<div class="text-right">
								{#if a.tickable}
									<form method="POST" action="?/tick" use:enhance={toastResult()}>
										<input type="hidden" name="achievementId" value={a.id} />
										<input type="hidden" name="unlocked" value={a.unlockedAt ? '0' : '1'} />
										<button
											class="grid size-8 place-items-center border {a.unlockedAt
												? 'border-ember bg-ember/15 text-ember'
												: 'border-rule text-faint hover:border-dust'}"
											aria-label={a.unlockedAt
												? `Mark ${a.name} as locked`
												: `Mark ${a.name} as unlocked`}><Check class="size-4" /></button
										>
									</form>
								{:else}
									<span class="font-mono text-[11px] text-dust"
										>{a.unlockedAt ? formatDate(a.unlockedAt) : 'locked'}</span
									>
								{/if}
								<span class="sm:hidden"><Rarity value={a.globalPercent} /></span>
							</div>
						</li>
					{:else}
						<li class="p-4 text-center text-dust italic">Nothing here.</li>
					{/each}
				</ul>
			</section>
		{:else if game.steamAppId && game.schemaUpdatedAt}
			<p class="text-dust italic">
				This game has no Steam achievements. Make your own checklist below.
			</p>
		{/if}

		<!-- Checklist -->
		<section class="grid gap-3" aria-labelledby="checklist-title">
			<h2 id="checklist-title" class="rule-title">
				Checklist{checklist.length ? ` · ${checklistDone} / ${checklist.length}` : ''}
			</h2>
			<p class="text-sm text-dust">
				Your own 100% beyond achievements: every boss, every charm, every ending. Items count toward
				completion and are shared with everyone who has the game.
			</p>
			{#if checklist.length}
				<ul class="border border-[#2a241b]">
					{#each checklist as item (item.id)}
						<li class="flex items-center gap-3 border-b border-[#1d1912] px-3 py-2 last:border-b-0">
							{#if entry}
								<form method="POST" action="?/tick" use:enhance={toastResult()}>
									<input type="hidden" name="achievementId" value={item.id} />
									<input type="hidden" name="unlocked" value={item.unlockedAt ? '0' : '1'} />
									<button
										class="grid size-7 place-items-center border {item.unlockedAt
											? 'border-ember bg-ember/15 text-ember'
											: 'border-rule text-faint hover:border-dust'}"
										aria-label={item.unlockedAt ? `Untick ${item.name}` : `Tick ${item.name}`}
										><Check class="size-4" /></button
									>
								</form>
							{/if}
							<div class="min-w-0 flex-1">
								<p class={item.unlockedAt ? 'text-dust line-through decoration-ember/50' : ''}>
									{item.name}
								</p>
								{#if item.description}<p class="text-sm text-dust">{item.description}</p>{/if}
							</div>
							{#if item.createdBy === data.userId || data.isAdmin}
								<form method="POST" action="?/deleteItem" use:enhance={toastResult()}>
									<input type="hidden" name="achievementId" value={item.id} />
									<button class="p-1 text-faint hover:text-blood" aria-label="Remove {item.name}"
										><Trash2 class="size-4" /></button
									>
								</form>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if addingItem}
				<form
					method="POST"
					action="?/addItem"
					use:enhance={toastResult({ reset: true })}
					class="panel grid gap-3 p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
				>
					<div class="grid gap-1.5">
						<label class="label" for="item-name">Item</label>
						<!-- svelte-ignore a11y_autofocus -->
						<input
							id="item-name"
							name="name"
							class="input"
							required
							maxlength="120"
							placeholder="Defeat Malenia"
							autofocus
						/>
					</div>
					<div class="grid gap-1.5">
						<label class="label" for="item-desc">Note (optional)</label>
						<input
							id="item-desc"
							name="description"
							class="input"
							maxlength="300"
							placeholder="Haligtree, after the Miquella questline"
						/>
					</div>
					<div class="flex gap-2">
						<button class="btn">Add</button>
						<button type="button" class="btn btn-ghost" onclick={() => (addingItem = false)}
							>Done</button
						>
					</div>
				</form>
			{:else}
				<button class="btn btn-ghost justify-self-start" onclick={() => (addingItem = true)}
					>+ Add an item</button
				>
			{/if}
		</section>

		<!-- Notes and rating -->
		{#if entry}
			<section class="grid gap-3" aria-labelledby="notes-title">
				<h2 id="notes-title" class="rule-title">Notes</h2>
				<form method="POST" action="?/update" use:enhance={toastResult()} class="grid gap-3">
					<label class="sr-only" for="notes">Notes</label>
					<textarea
						id="notes"
						name="notes"
						rows="4"
						class="input resize-y"
						placeholder="Back up your save before the final boss for the other endings…"
						>{entry.notes ?? ''}</textarea
					>
					<div class="flex flex-wrap items-end gap-3">
						<div class="grid gap-1.5">
							<label class="label" for="rating">Rating</label>
							<select id="rating" name="rating" class="input !w-auto" value={entry.rating ?? ''}>
								<option value="">No rating</option>
								{#each [10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as n (n)}<option value={n}>{n} / 10</option
									>{/each}
							</select>
						</div>
						<button class="btn">Save</button>
					</div>
				</form>
			</section>
		{/if}
	</main>
</div>
