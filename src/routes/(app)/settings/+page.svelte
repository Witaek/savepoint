<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import { ChevronRight } from '@lucide/svelte';
	import EmberBar from '$lib/components/EmberBar.svelte';
	import FormField from '$lib/components/FormField.svelte';
	import { formatDate, relativeTime } from '$lib/format';
	import { toastResult } from '$lib/forms';

	let { data } = $props();
	const steam = $derived(data.steam);

	// While a sync runs, follow its progress.
	let live = $state<{
		status?: string;
		message?: string;
		done?: number;
		total?: number;
		running: boolean;
	} | null>(null);
	let poll: ReturnType<typeof setInterval> | undefined;
	$effect(() => {
		if (!steam.running && !live?.running) return;
		clearInterval(poll);
		poll = setInterval(async () => {
			const response = await fetch('/api/sync-status').catch(() => null);
			if (!response?.ok) return;
			live = await response.json();
			if (!live?.running) {
				clearInterval(poll);
				await invalidateAll();
			}
		}, 1500);
		return () => clearInterval(poll);
	});
	onDestroy(() => clearInterval(poll));
	const syncView = $derived(live ?? { ...steam.sync, running: steam.running });

	const startSync = toastResult({
		onDone: () => (live = { running: true, message: 'Starting…' })
	});
	const maskUrl = (url: string) => {
		try {
			const u = new URL(url);
			return u.host + (u.pathname.length > 24 ? `${u.pathname.slice(0, 20)}…` : u.pathname);
		} catch {
			return url;
		}
	};
</script>

<svelte:head><title>Settings · Savepoint</title></svelte:head>

<main
	class="mx-auto grid max-w-3xl gap-8 px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-12 md:px-8 md:pt-8"
>
	<h1 class="font-display text-2xl tracking-[0.14em] md:text-3xl">SETTINGS</h1>

	<!-- Steam -->
	<section id="steam" class="grid scroll-mt-6 gap-3">
		<h2 class="rule-title">Steam</h2>
		{#if !steam.configured}
			<div class="panel grid gap-2 p-4 text-dust">
				<p>
					Steam import is off: the server has no Steam Web API key. Get one free at
					<a
						class="text-ember underline underline-offset-4"
						href="https://steamcommunity.com/dev/apikey"
						target="_blank"
						rel="noreferrer">steamcommunity.com/dev/apikey</a
					>, then set <code class="font-mono text-soul">STEAM_API_KEY</code> in CasaOS (or your
					<code class="font-mono text-soul">.env</code>) and restart Savepoint.
				</p>
			</div>
		{:else if !steam.steamId}
			<div class="panel grid gap-3 p-4">
				<p class="text-dust">
					Paste your Steam profile link. Savepoint imports every game you own with its playtime and
					achievements, then keeps them up to date.
				</p>
				<form
					method="POST"
					action="?/linkSteam"
					use:enhance={startSync}
					class="flex flex-wrap items-end gap-3"
				>
					<div class="min-w-64 flex-1">
						<FormField
							label="Profile link or SteamID"
							name="profile"
							placeholder="https://steamcommunity.com/id/yourname"
							autocapitalize="none"
							autocomplete="off"
							required
						/>
					</div>
					<button class="btn">Link Steam</button>
				</form>
				<p class="text-sm text-dust">
					Your profile and its <b class="text-ash">Game details</b> must be public (Steam → Profile →
					Edit Profile → Privacy Settings), or Steam shares nothing.
				</p>
			</div>
		{:else}
			<div class="panel grid gap-4 p-4">
				<div class="flex items-center gap-3">
					{#if steam.avatar}<img
							src={steam.avatar}
							alt=""
							class="size-12 border border-rule"
						/>{/if}
					<div class="min-w-0 flex-1">
						<p class="font-display tracking-[0.06em]">{steam.name}</p>
						<p class="font-mono text-[11px] text-dust">
							{steam.steamId}{steam.syncedAt ? ` · synced ${relativeTime(steam.syncedAt)}` : ''}
						</p>
					</div>
				</div>
				{#if syncView.running}
					<div class="grid gap-2" role="status">
						<p class="text-sm text-ember">
							{syncView.message ?? 'Syncing…'}{syncView.total
								? ` ${syncView.done ?? 0} / ${syncView.total} games`
								: ''}
						</p>
						{#if syncView.total}
							<EmberBar
								value={((syncView.done ?? 0) / syncView.total) * 100}
								label="Sync progress"
							/>
						{/if}
						<p class="text-sm text-dust">
							A large library takes a few minutes the first time. You can leave this page.
						</p>
					</div>
				{:else if syncView.status === 'error'}
					<p class="border border-blood/40 bg-blood/10 p-3 text-sm text-blood" role="alert">
						{syncView.message}
					</p>
				{:else if syncView.message}
					<p class="text-sm text-dust">Last sync: {syncView.message}.</p>
				{/if}
				<!-- Full-width on phones: Sync now on its own row, the other two side by side. -->
				<div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
					<form method="POST" action="?/syncSteam" use:enhance={startSync} class="col-span-2">
						<button class="btn w-full" disabled={syncView.running}>Sync now</button>
					</form>
					<form method="POST" action="?/syncSteam" use:enhance={startSync}>
						<input type="hidden" name="all" value="1" />
						<button
							class="btn btn-ghost w-full"
							disabled={syncView.running}
							title="Re-read the achievements of every game, not only the ones played since"
							>Re-read everything</button
						>
					</form>
					<form method="POST" action="?/unlinkSteam" use:enhance={toastResult()}>
						<button class="btn btn-danger w-full" disabled={syncView.running}>Unlink</button>
					</form>
				</div>
				<p class="text-sm text-dust">
					Games you played in the last two weeks are checked every 15 minutes; the whole library
					every night.
				</p>
			</div>
		{/if}
	</section>

	<!-- Notifications -->
	<section class="grid gap-3">
		<h2 class="rule-title">Notifications</h2>
		<p class="text-sm text-dust">
			Get a message when you unlock achievements, and a special one at 100%. Use an
			<a
				class="text-ember underline underline-offset-4"
				href="https://ntfy.sh"
				target="_blank"
				rel="noreferrer">ntfy</a
			>
			topic (free phone app) or a Discord webhook.
		</p>
		{#each data.targets as target (target.id)}
			<div class="panel grid gap-2 p-3">
				<div class="flex flex-wrap items-center gap-2">
					<span class="label !text-ember">{target.type === 'ntfy' ? 'ntfy' : 'Discord'}</span>
					<span class="min-w-0 flex-1 truncate font-mono text-xs text-dust"
						>{maskUrl(target.url)}</span
					>
					<form method="POST" action="?/testTarget" use:enhance={toastResult()}>
						<input type="hidden" name="id" value={target.id} />
						<button class="chip hover:!text-ash">Test</button>
					</form>
					<form method="POST" action="?/toggleTarget" use:enhance={toastResult()}>
						<input type="hidden" name="id" value={target.id} />
						<button class="chip hover:!text-ash">{target.enabled ? 'Pause' : 'Resume'}</button>
					</form>
					<form method="POST" action="?/deleteTarget" use:enhance={toastResult()}>
						<input type="hidden" name="id" value={target.id} />
						<button class="chip hover:!text-blood">Remove</button>
					</form>
				</div>
				{#if target.lastError}
					<p class="text-sm text-blood">Last attempt failed: {target.lastError}</p>
				{:else if target.lastSentAt}
					<p class="text-sm text-dust">Last sent {relativeTime(target.lastSentAt)}.</p>
				{/if}
			</div>
		{/each}
		<form
			method="POST"
			action="?/addTarget"
			use:enhance={toastResult({ reset: true })}
			class="panel grid gap-3 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end"
		>
			<div class="grid gap-1.5">
				<label class="label" for="target-type">Type</label>
				<select id="target-type" name="type" class="input !w-auto">
					<option value="ntfy">ntfy</option>
					<option value="discord">Discord</option>
				</select>
			</div>
			<FormField
				label="Address"
				name="url"
				placeholder="https://ntfy.sh/my-savepoint-topic"
				autocapitalize="none"
				required
			/>
			<button class="btn">Add</button>
		</form>
	</section>

	<!-- Display -->
	<section class="grid gap-3">
		<h2 class="rule-title">Display</h2>
		<form
			method="POST"
			action="?/prefs"
			use:enhance={toastResult({ quiet: true })}
			class="panel grid gap-3 p-4"
		>
			<label class="flex items-start gap-3">
				<input
					type="checkbox"
					name="celebrate"
					checked={data.prefs.celebrate}
					class="mt-1 size-4 accent-[#e3a54b]"
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				/>
				<span
					><span class="block">Celebrate a 100%</span><span class="text-sm text-dust"
						>Show “Perfection achieved” full screen once when a game reaches 100%.</span
					></span
				>
			</label>
			<label class="flex items-start gap-3">
				<input
					type="checkbox"
					name="showHidden"
					checked={data.prefs.showHidden}
					class="mt-1 size-4 accent-[#e3a54b]"
					onchange={(e) => e.currentTarget.form?.requestSubmit()}
				/>
				<span
					><span class="block">Show hidden achievements</span><span class="text-sm text-dust"
						>Otherwise they stay blurred until you tap Reveal.</span
					></span
				>
			</label>
		</form>
	</section>

	<!-- Account -->
	<section class="grid gap-3">
		<h2 class="rule-title">Account</h2>
		<div class="panel grid gap-5 p-4">
			<form
				method="POST"
				action="?/profile"
				use:enhance={toastResult()}
				class="flex flex-wrap items-end gap-3"
			>
				<div class="min-w-56 flex-1">
					<FormField
						label="Display name"
						name="displayName"
						value={data.account.displayName}
						required
						maxlength={60}
					/>
				</div>
				<button class="btn btn-ghost">Save</button>
			</form>
			<form
				method="POST"
				action="?/password"
				use:enhance={toastResult({ reset: true })}
				class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
			>
				<FormField
					label="Current password"
					name="current"
					type="password"
					autocomplete="current-password"
					required
				/>
				<FormField
					label="New password"
					name="password"
					type="password"
					autocomplete="new-password"
					required
				/>
				<button class="btn btn-ghost">Change</button>
			</form>
			<div class="grid gap-2 sm:flex sm:flex-wrap">
				<form method="POST" action="?/signOutOthers" use:enhance={toastResult()}>
					<button class="btn btn-ghost w-full">Sign out other devices</button>
				</form>
				<form
					method="POST"
					action="/logout"
					onsubmit={() => navigator.serviceWorker?.controller?.postMessage('clear-user-data')}
				>
					<button class="btn btn-danger w-full">Sign out</button>
				</form>
			</div>
			<p class="font-mono text-[11px] text-dust">Signed in as @{data.account.username}</p>
		</div>
	</section>

	{#if data.isAdmin}
		<section class="grid gap-3">
			<h2 class="rule-title">Server</h2>
			<a
				href="/settings/users"
				class="panel flex items-center justify-between p-4 hover:border-ember-dim"
			>
				<span
					>Users <span class="text-sm text-dust">· add accounts for everyone in the house</span
					></span
				>
				<ChevronRight class="size-4 text-dust" />
			</a>
			<div class="panel grid gap-3 p-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h3 class="label">Backups · every night, kept 14 days</h3>
					<form method="POST" action="?/backup" use:enhance={toastResult()}>
						<button class="btn btn-ghost">Back up now</button>
					</form>
				</div>
				{#each data.backups as backup (backup.name)}
					<a
						href="/api/backups/{backup.name}"
						class="flex justify-between gap-3 font-mono text-xs text-dust hover:text-ash"
						data-sveltekit-reload
					>
						<span class="truncate">{backup.name}</span>
						<span>{Math.round(backup.size / 1024)} KB</span>
					</a>
				{:else}
					<p class="text-sm text-dust">No backups yet.</p>
				{/each}
			</div>
			<div class="panel grid gap-2 p-4">
				<h3 class="label">Background jobs</h3>
				{#each data.jobs as job (job.name)}
					<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 text-sm">
						<span class="font-mono text-xs">{job.name}</span>
						<span
							class="font-mono text-xs {job.lastRun?.status === 'error'
								? 'text-blood'
								: 'text-dust'}"
						>
							{job.lastRun
								? `${job.lastRun.status} ${relativeTime(job.lastRun.startedAt)}`
								: 'not run yet'}
						</span>
						{#if job.lastRun?.message}<span class="col-span-2 truncate text-xs text-dust"
								>{job.lastRun.message}</span
							>{/if}
					</div>
				{:else}
					<p class="text-sm text-dust">Background jobs are off (DISABLE_JOBS).</p>
				{/each}
			</div>
		</section>
	{/if}

	<p class="text-center font-mono text-[11px] text-faint">
		Savepoint {data.version} · Steam {steam.configured ? 'on' : 'off'} · IGDB {data.igdbConfigured
			? 'on'
			: 'off'} ·
		{formatDate(new Date())}
	</p>
</main>
