<script lang="ts">
	import { page } from '$app/state';
	import { ChartColumn, Crown, Flame, LibraryBig, Search, Settings } from '@lucide/svelte';

	let { syncing = false, steamName = null }: { syncing?: boolean; steamName?: string | null } =
		$props();

	const items = [
		{ href: '/', label: 'Bonfire', icon: Flame },
		{ href: '/library', label: 'Library', icon: LibraryBig },
		{ href: '/search', label: 'Search', icon: Search },
		{ href: '/hall-of-fame', label: 'Hall of Fame', short: 'Fame', icon: Crown },
		{ href: '/stats', label: 'Stats', icon: ChartColumn },
		{ href: '/settings', label: 'Settings', icon: Settings }
	];
	// Stats is reached from the Bonfire on phones: five tabs fit.
	const tabs = items.filter((i) => i.href !== '/stats');

	const isActive = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<!-- Desktop sidebar -->
<nav
	class="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-[#2a241b] bg-gradient-to-b from-[#110f0b] to-abyss py-6 lg:flex"
	aria-label="Main"
>
	<a href="/" class="mb-7 flex items-center gap-3 px-5">
		<img src="/favicon.svg" alt="" class="size-8" />
		<span class="font-display text-[15px] font-black tracking-[0.16em]">SAVEPOINT</span>
	</a>
	<ul class="space-y-0.5">
		{#each items as item (item.href)}
			{@const active = isActive(item.href)}
			<li>
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class="flex items-center gap-3 border-l-2 px-5 py-2.5 font-display text-[13px] tracking-[0.1em] transition-colors {active
						? 'border-ember bg-gradient-to-r from-ember/15 to-transparent text-ash'
						: 'border-transparent text-dust hover:text-ash'}"
				>
					<item.icon class="size-[18px] {active ? 'text-ember' : ''}" strokeWidth={1.75} />
					{item.label}
				</a>
			</li>
		{/each}
	</ul>
	<div class="mt-auto px-5 font-mono text-[10.5px] leading-relaxed text-faint">
		{#if steamName}
			<div class="truncate">Steam · {steamName}</div>
			<div class={syncing ? 'text-ember' : 'text-moss'}>
				● {syncing ? 'Syncing…' : 'Linked'}
			</div>
		{:else}
			<a href="/settings#steam" class="hover:text-dust">Link your Steam account →</a>
		{/if}
	</div>
</nav>

<!-- Phone tab bar -->
<nav
	class="fixed inset-x-0 bottom-0 z-30 border-t border-[#2a241b] bg-abyss/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
	aria-label="Main"
>
	<ul class="mx-auto grid max-w-lg grid-cols-5">
		{#each tabs as item (item.href)}
			{@const active = isActive(item.href)}
			<li>
				<a
					href={item.href}
					aria-current={active ? 'page' : undefined}
					class="flex flex-col items-center gap-1 pt-2.5 pb-2 font-display text-[10px] tracking-[0.1em] uppercase transition-colors {active
						? 'text-ember'
						: 'text-faint'}"
				>
					<item.icon class="size-[22px]" strokeWidth={active ? 2 : 1.5} />
					{item.short ?? item.label}
				</a>
			</li>
		{/each}
	</ul>
</nav>
