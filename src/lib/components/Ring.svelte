<script lang="ts">
	let {
		value,
		label = 'Complete',
		size = 88
	}: { value: number; label?: string; size?: number } = $props();
	const gold = $derived(value >= 100);
</script>

<div
	class="relative grid shrink-0 place-items-center rounded-full ring"
	style="--p: {value}; width: {size}px; height: {size}px; --c: {gold ? '#ffd28a' : '#e3a54b'}"
	role="img"
	aria-label="{value}% {label}"
>
	<span class="relative text-center leading-none">
		<span class="block font-display text-xl">{value}%</span>
		<span class="label mt-1 block !text-[0.55rem]">{label}</span>
	</span>
</div>

<style>
	.ring {
		background: conic-gradient(var(--c) calc(var(--p) * 1%), #231e16 0);
	}
	.ring::before {
		content: '';
		position: absolute;
		inset: 6px;
		border-radius: 50%;
		background: #0c0b09;
	}
</style>
