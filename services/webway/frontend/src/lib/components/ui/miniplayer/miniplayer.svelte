<script lang="ts">
	import { radio } from '$lib/radio.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Play, Pause, Loader2, Volume2, Radio as RadioIcon } from 'lucide-svelte';
	import { page } from '$app/state';

	// Прячем на самой странице /radio
	const hidden = $derived(page.url.pathname === '/radio');

	async function skip() {
		try {
			await fetch('/api/radio/skip', { method: 'POST' });
			setTimeout(() => radio.refreshNow(), 500);
		} catch {}
	}
</script>

{#if !hidden && (radio.playing || radio.now?.status === 'playing')}
	<div
		class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 w-[min(720px,calc(100%-2rem))] rounded-full border bg-card/95 backdrop-blur-md shadow-2xl"
	>
		<div class="flex items-center gap-3 px-3 py-2">
			<!-- Play/pause -->
			<Button
				onclick={() => radio.toggle()}
				disabled={radio.reconnecting}
				size="icon"
				class="h-10 w-10 rounded-full shrink-0 bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 border-0"
			>
				{#if radio.reconnecting}
					<Loader2 class="h-4 w-4 animate-spin text-white" />
				{:else if radio.playing}
					<Pause class="h-4 w-4 text-white fill-white" />
				{:else}
					<Play class="h-4 w-4 text-white fill-white ml-0.5" />
				{/if}
			</Button>

			<!-- Track info -->
			<div class="flex-1 min-w-0">
				<div class="flex items-center gap-2">
					<Badge class="gap-1 bg-red-500/15 text-red-400 border-red-500/30 text-[9px] px-1 py-0 shrink-0">
						<span class="relative flex h-1 w-1">
							<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60"></span>
							<span class="relative inline-flex h-1 w-1 rounded-full bg-red-500"></span>
						</span>
						LIVE
					</Badge>
					<span class="text-sm font-medium truncate">
						{radio.now?.title ?? 'Тишина'}
					</span>
					{#if radio.now?.artist}
						<span class="text-xs text-muted-foreground truncate hidden sm:inline">
							· {radio.now.artist}
						</span>
					{/if}
				</div>
				{#if radio.now?.next}
					<div class="text-[10px] text-muted-foreground truncate mt-0.5">
						Далее: <span class="text-foreground/70">{radio.now.next.title}</span>
						{#if radio.now.next.from_queue}
							<span class="text-violet-400 ml-1">· очередь</span>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Volume (hidden on mobile) -->
			<div class="hidden md:flex items-center gap-2 shrink-0">
				<Volume2 class="h-3.5 w-3.5 text-muted-foreground" />
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					value={radio.volume}
					oninput={(e) => radio.setVolume(Number((e.target as HTMLInputElement).value))}
					class="w-20 accent-violet-500"
				/>
			</div>

			<!-- Link to full page -->
			<a
				href="/radio"
				class="shrink-0 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
				title="Открыть полный плеер"
			>
				<RadioIcon class="h-3.5 w-3.5" />
				<span class="hidden sm:inline">Радио</span>
			</a>
		</div>
	</div>
{/if}