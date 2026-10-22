<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Settings } from '@lucide/svelte';

	let {
		title,
		gold = false,
		children
	}: { title: string; gold?: boolean; children?: Snippet } = $props();
</script>

<!-- Page title, with the way to Settings on phones (the tab bar has no room for it). -->
<header class="flex items-center justify-between gap-3">
	<h1
		class="font-display text-2xl tracking-[0.14em] md:text-3xl {gold
			? 'text-gold [text-shadow:0_0_24px_rgba(255,190,90,.35)]'
			: ''}"
	>
		{title}
	</h1>
	<div class="flex items-center gap-1">
		{@render children?.()}
		<a
			href="/settings"
			class="-mr-2.5 grid size-11 place-items-center text-dust hover:text-ash lg:hidden"
			aria-label="Settings"
		>
			<Settings class="size-5" strokeWidth={1.5} />
		</a>
	</div>
</header>
