<script lang="ts">
	let { children } = $props();
</script>

<main class="grid min-h-dvh place-items-center px-4 py-12">
	<div class="w-full max-w-sm">
		<div class="mb-9 flex flex-col items-center text-center">
			<img
				src="/favicon.svg"
				alt=""
				class="mb-5 size-16 drop-shadow-[0_0_24px_rgba(255,150,60,0.45)]"
			/>
			<h1 class="font-display text-3xl font-black tracking-[0.18em] text-ember">SAVEPOINT</h1>
			<p class="mt-2 text-dust italic">Your games, and every achievement in them.</p>
		</div>
		{@render children()}
	</div>
</main>
