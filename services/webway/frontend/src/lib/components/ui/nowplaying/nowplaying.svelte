<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Music, SkipForward, Loader2, ArrowRight } from 'lucide-svelte';

	let {
		now,
		onSkip,
		canSkip = false,
		skipping = false
	}: {
		now: any;
		onSkip?: () => void;
		canSkip?: boolean;
		skipping?: boolean;
	} = $props();

	let progressTick = $state(0);
	$effect(() => {
		const id = setInterval(() => (progressTick = progressTick + 1), 1000);
		return () => clearInterval(id);
	});

	const liveProgress = $derived.by(() => {
		progressTick;
		if (!now?.started_at || !now?.ends_at) return 0;
		const start = new Date(now.started_at).getTime();
		const end = new Date(now.ends_at).getTime();
		const t = Date.now();
		if (t <= start) return 0;
		if (t >= end) return 100;
		return Math.min(100, ((t - start) / (end - start)) * 100);
	});

	const timeLeft = $derived.by(() => {
		progressTick;
		if (!now?.ends_at) return null;
		const remain = Math.max(0, Math.floor((new Date(now.ends_at).getTime() - Date.now()) / 1000));
		const m = Math.floor(remain / 60);
		const s = remain % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	});
</script>

<div class="rounded-xl border bg-card p-5 space-y-4">
	<div class="flex items-start gap-4">
		<div class="flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30 shrink-0">
			<Music class="h-6 w-6 text-violet-400" />
		</div>

		<div class="flex-1 min-w-0">
			<div class="flex items-center gap-2 flex-wrap">
				<Badge class="gap-1 bg-red-500/15 text-red-400 border-red-500/30 text-[10px] px-1.5 py-0">
					<span class="relative flex h-1.5 w-1.5">
						<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-60"></span>
						<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-500"></span>
					</span>
					LIVE
				</Badge>
				{#if timeLeft}
					<span class="text-[10px] text-muted-foreground font-mono">
						осталось {timeLeft}
					</span>
				{/if}
			</div>

			{#if now?.status === 'playing'}
				<div class="text-lg font-semibold truncate mt-1">{now.title}</div>
				{#if now.artist}
					<div class="text-sm text-muted-foreground truncate">{now.artist}</div>
				{/if}
			{:else}
				<div class="text-lg font-semibold text-muted-foreground mt-1">
					Тишина в эфире
				</div>
				<div class="text-sm text-muted-foreground">Скоро вернёмся</div>
			{/if}
		</div>

		{#if canSkip && now?.status === 'playing'}
			<Button
				variant="outline"
				size="icon"
				onclick={onSkip}
				disabled={skipping}
				title="Пропустить трек"
			>
				{#if skipping}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<SkipForward class="h-4 w-4" />
				{/if}
			</Button>
		{/if}
	</div>

	{#if now?.status === 'playing' && now.ends_at}
		<div>
			<div class="h-1 rounded-full bg-muted overflow-hidden">
				<div
					class="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-1000 ease-linear"
					style="width: {liveProgress}%"
				></div>
			</div>
		</div>
	{/if}

	<!-- Далее -->
	{#if now?.next}
		<div class="flex items-center gap-2.5 rounded-md border border-dashed bg-muted/30 px-3 py-2">
			<ArrowRight class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
			<div class="flex-1 min-w-0">
				<div class="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
					Далее
					{#if now.next.from_queue}
						<span class="text-violet-400 normal-case tracking-normal">· из очереди</span>
					{/if}
				</div>
				<div class="text-sm truncate">
					<span class="font-medium">{now.next.title}</span>
					{#if now.next.artist}
						<span class="text-muted-foreground"> · {now.next.artist}</span>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>