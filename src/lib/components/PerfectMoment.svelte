<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let { game }: { game: { gameId: number; name: string; hero: string | null; total: number } } =
		$props();

	let open = $state(true);

	async function close() {
		open = false;
		await fetch('/api/celebrated', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ gameId: game.gameId })
		}).catch(() => {});
		await invalidateAll();
	}

	function onkeydown(event: KeyboardEvent) {
		if (open && (event.key === 'Escape' || event.key === 'Enter')) void close();
	}
</script>

<svelte:window {onkeydown} />

{#if open}
	<div
		class="moment fixed inset-0 z-[60] grid place-items-center overflow-hidden"
		role="dialog"
		aria-modal="true"
		aria-labelledby="moment-title"
	>
		{#if game.hero}
			<img
				src={game.hero}
				alt=""
				class="absolute inset-0 size-full object-cover opacity-25 blur-[2px]"
			/>
		{/if}
		<button class="absolute inset-0 cursor-default" aria-label="Close" onclick={close}></button>
		<div class="band pointer-events-none relative w-full py-10 text-center">
			<p
				id="moment-title"
				class="title font-display text-[clamp(1.9rem,6vw,3.6rem)] text-[#f4d48a]"
			>
				PERFECTION ACHIEVED
			</p>
			<p class="label mt-4 !text-[0.7rem] !tracking-[0.24em]">
				{game.name} · {game.total} / {game.total} · added to the Hall of Fame
			</p>
		</div>
		<button
			class="btn btn-ghost absolute bottom-[calc(2rem+env(safe-area-inset-bottom))]"
			onclick={close}>Continue</button
		>
	</div>
{/if}

<style>
	.moment {
		background: radial-gradient(ellipse 60% 70% at 50% 60%, #2a0d0d, #070505 80%);
		animation: fade 0.6s ease-out;
	}
	.band {
		background: linear-gradient(
			90deg,
			transparent,
			rgb(0 0 0 / 0.85) 18%,
			rgb(0 0 0 / 0.85) 82%,
			transparent
		);
	}
	.title {
		letter-spacing: 0.12em;
		text-shadow:
			0 0 18px rgb(255 190 90 / 0.55),
			0 0 60px rgb(255 150 60 / 0.35);
		animation: rise 2.4s ease-out both;
	}
	@keyframes rise {
		from {
			opacity: 0;
			letter-spacing: 0.02em;
			filter: blur(3px);
		}
		to {
			opacity: 1;
			letter-spacing: 0.12em;
			filter: blur(0);
		}
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
</style>
