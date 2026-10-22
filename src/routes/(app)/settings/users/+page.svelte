<script lang="ts">
	import { enhance } from '$app/forms';
	import { ChevronLeft } from '@lucide/svelte';
	import FormField from '$lib/components/FormField.svelte';
	import { formatDate } from '$lib/format';

	let { data, form } = $props();
	let resetFor = $state<number | null>(null);
	let deleteFor = $state<number | null>(null);
</script>

<svelte:head><title>Users · Savepoint</title></svelte:head>

<main
	class="mx-auto grid max-w-3xl gap-6 px-4 pt-[calc(1.25rem+env(safe-area-inset-top))] pb-10 md:px-8 md:pt-8"
>
	<a href="/settings" class="label flex items-center gap-1 hover:!text-ash"
		><ChevronLeft class="size-3" /> Settings</a
	>
	<h1 class="font-display text-2xl tracking-[0.14em]">USERS</h1>

	{#if form?.message}<p
			class="border border-moss/40 bg-moss/10 p-3 text-sm text-moss"
			role="status"
		>
			{form.message}
		</p>{/if}
	{#if form?.error}<p
			class="border border-blood/40 bg-blood/10 p-3 text-sm text-blood"
			role="alert"
		>
			{form.error}
		</p>{/if}

	<ul class="grid gap-3">
		{#each data.users as user (user.id)}
			<li class="panel grid gap-3 p-4">
				<div class="flex flex-wrap items-baseline justify-between gap-2">
					<div>
						<p class="font-display tracking-[0.06em]">
							{user.displayName}
							<span class="font-mono text-xs text-dust">@{user.username}</span>
						</p>
						<p class="font-mono text-[11px] text-dust">
							{user.role === 'admin' ? 'Admin' : 'Member'} · {user.games} games · since {formatDate(
								user.createdAt
							)}{user.disabled ? ' · disabled' : ''}
						</p>
					</div>
					{#if user.id === data.currentUserId}<span class="label !text-ember">You</span>{/if}
				</div>
				{#if user.id !== data.currentUserId}
					<div class="flex flex-wrap gap-2">
						<form method="POST" action="?/role" use:enhance>
							<input type="hidden" name="userId" value={user.id} />
							<input type="hidden" name="role" value={user.role === 'admin' ? 'user' : 'admin'} />
							<button class="btn btn-ghost"
								>{user.role === 'admin' ? 'Make member' : 'Make admin'}</button
							>
						</form>
						<form method="POST" action="?/toggleDisabled" use:enhance>
							<input type="hidden" name="userId" value={user.id} />
							<button class="btn btn-ghost">{user.disabled ? 'Enable' : 'Disable'}</button>
						</form>
						<button
							class="btn btn-ghost"
							onclick={() => (resetFor = resetFor === user.id ? null : user.id)}
							>Reset password</button
						>
						{#if deleteFor === user.id}
							<form method="POST" action="?/delete" use:enhance>
								<input type="hidden" name="userId" value={user.id} />
								<button class="btn btn-danger">Delete {user.username} and their library</button>
							</form>
						{:else}
							<button class="btn btn-danger" onclick={() => (deleteFor = user.id)}>Delete</button>
						{/if}
					</div>
					{#if resetFor === user.id}
						<form method="POST" action="?/reset" use:enhance class="flex flex-wrap items-end gap-2">
							<input type="hidden" name="userId" value={user.id} />
							<div class="min-w-48 flex-1">
								<FormField
									label="New password"
									name="password"
									id="reset-{user.id}"
									type="password"
									autocomplete="new-password"
									required
								/>
							</div>
							<button class="btn">Reset</button>
						</form>
					{/if}
				{/if}
			</li>
		{/each}
	</ul>

	<section class="panel grid gap-4 p-4">
		<h2 class="rule-title">Add someone</h2>
		<form method="POST" action="?/create" use:enhance class="grid gap-3 sm:grid-cols-2">
			<FormField
				label="Username"
				name="username"
				autocapitalize="none"
				required
				value={form?.action === 'create' ? ((form as { username?: string }).username ?? '') : ''}
			/>
			<FormField label="Display name" name="displayName" />
			<FormField
				label="Password"
				name="password"
				type="password"
				autocomplete="new-password"
				required
				hint="At least 8 characters."
			/>
			<div class="grid gap-1.5">
				<label class="label" for="role">Role</label>
				<select id="role" name="role" class="input"
					><option value="user">Member</option><option value="admin">Admin</option></select
				>
			</div>
			<button class="btn sm:col-span-2">Create account</button>
		</form>
	</section>
</main>
