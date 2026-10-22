<script lang="ts">
	import AchievementIcon from './AchievementIcon.svelte';
	import Rarity from './Rarity.svelte';
	import { relativeTime } from '$lib/format';

	let {
		unlock,
		showGame = true
	}: {
		unlock: {
			name: string;
			icon: string | null;
			globalPercent: number | null;
			unlockedAt: Date;
			gameId: number;
			gameName: string;
		};
		showGame?: boolean;
	} = $props();
</script>

<a href="/game/{unlock.gameId}" class="flex items-center gap-3 py-1.5 hover:bg-white/[0.02]">
	<AchievementIcon src={unlock.icon} size={36} />
	<span class="min-w-0 flex-1">
		<span class="block truncate font-display text-[13px] tracking-[0.04em]">{unlock.name}</span>
		<span class="block truncate text-[13px] text-dust"
			>{showGame ? `${unlock.gameName} · ` : ''}{relativeTime(unlock.unlockedAt)}</span
		>
	</span>
	<Rarity value={unlock.globalPercent} />
</a>
