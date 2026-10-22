<script lang="ts">
	import { navigating } from '$app/state';
	import { Toaster } from 'svelte-sonner';
	import AppNav from '$lib/components/AppNav.svelte';
	import PerfectMoment from '$lib/components/PerfectMoment.svelte';

	let { data, children } = $props();

	// Show the progress bar only for navigations that take a moment.
	let showProgress = $state(false);
	$effect(() => {
		if (!navigating.to) {
			showProgress = false;
			return;
		}
		const timer = setTimeout(() => (showProgress = true), 150);
		return () => clearTimeout(timer);
	});
</script>

{#if showProgress}
	<div
		class="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden"
		role="progressbar"
		aria-label="Loading"
	>
		<div class="nav-progress h-full w-1/3 bg-ember shadow-[0_0_10px_#ff8a3a]"></div>
	</div>
{/if}

<AppNav syncing={data.syncing} steamName={data.user.steamName} />

<div class="min-h-dvh pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-0 lg:pl-56">
	{@render children()}
</div>

{#if data.celebration}
	{#key data.celebration.gameId}
		<PerfectMoment game={data.celebration} />
	{/key}
{/if}

<Toaster
	theme="dark"
	position="bottom-center"
	offset={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom))' }}
	mobileOffset={{ bottom: 'calc(5.25rem + env(safe-area-inset-bottom))' }}
	toastOptions={{
		style:
			'background:#15120d;border:1px solid #4a3f2e;color:#ebe3d1;font-family:Spectral,Georgia,serif;border-radius:0'
	}}
/>

<style>
	.nav-progress {
		animation: nav-progress 1.1s ease-in-out infinite;
	}
	@keyframes nav-progress {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(300%);
		}
	}
</style>
