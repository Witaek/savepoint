<script lang="ts">
	let {
		value,
		gold = false,
		class: className = '',
		label
	}: { value: number; gold?: boolean; class?: string; label?: string } = $props();
</script>

<div
	class="ember-bar {gold ? 'gold' : ''} {className}"
	role="progressbar"
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={Math.round(value)}
	aria-label={label}
>
	<i style="width: {Math.max(0, Math.min(100, value))}%"></i>
</div>
