<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import NowPlaying from '$lib/components/ui/nowplaying';
	import { notify } from '$lib/utils/toast';
	import { formatDateTime } from '$lib/utils/format';
	import { radio } from '$lib/radio.svelte';
	import {
		Radio as RadioIcon, Volume2, Music, ExternalLink, Library, Loader2
	} from 'lucide-svelte';

	let { data } = $props();

	let history = $state(data.history);
	let skipping = $state(false);

	// Локальный стейт для input[type=range] — синхронизируется со стором
	let volume = $state(radio.volume);

	// Плеер уже мог играть до захода на страницу — подтянем now
	$effect(() => {
		radio.refreshNow();
	});

	// Volume в стор
	$effect(() => {
		radio.setVolume(volume);
	});

	// История эфира — обновляем раз в 5 сек
	$effect(() => {
		const id = setInterval(async () => {
			try {
				const histRes = await fetch('/api/radio/history?limit=20');
				if (histRes.ok) history = await histRes.json();
			} catch {}
		}, 5000);
		return () => clearInterval(id);
	});

	async function skip() {
		skipping = true;
		try {
			const resp = await fetch('/api/radio/skip', { method: 'POST' });
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Трек пропущен');
			setTimeout(() => radio.refreshNow(), 500);
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось пропустить');
		} finally {
			skipping = false;
		}
	}

	const streamUrl = '/radio/stream';
</script>

<svelte:head>
	<title>Радио — Anathema</title>
</svelte:head>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight flex items-center gap-3">
				<RadioIcon class="h-7 w-7 text-violet-400" />
				Anathema Radio
			</h1>
			<p class="text-sm text-muted-foreground mt-1">
				Синхронный эфир · {data.songsCount} треков в библиотеке
			</p>
		</div>
		<a href="/radio/library">
			<Button variant="outline" class="gap-2">
				<Library class="h-4 w-4" />
				Библиотека
			</Button>
		</a>
	</div>

	<!-- Now playing (из стора) -->
	<NowPlaying now={radio.now} onSkip={skip} canSkip={true} {skipping} />
	{#if radio.now?.next}
		<div class="rounded-xl border bg-card px-4 py-3 flex items-center gap-3">
			<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-muted shrink-0">
				<Music class="h-4 w-4 text-muted-foreground" />
			</div>
			<div class="flex-1 min-w-0">
				<div class="text-[10px] uppercase tracking-wider text-muted-foreground">
					Далее
					{#if radio.now.next.from_queue}
						<span class="text-violet-400 ml-1">· из очереди</span>
					{/if}
				</div>
				<div class="text-sm font-medium truncate">{radio.now.next.title}</div>
				{#if radio.now.next.artist}
					<div class="text-xs text-muted-foreground truncate">{radio.now.next.artist}</div>
				{/if}
			</div>
		</div>
	{/if}

	<!-- Player (тоже из стора) -->
	<div class="rounded-xl border bg-gradient-to-br from-card to-muted/20 p-5">
		<div class="flex items-center gap-4">
			<Button
				onclick={() => radio.toggle()}
				disabled={radio.reconnecting}
				class="h-14 w-14 rounded-full shrink-0 bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 border-0"
			>
				{#if radio.reconnecting}
					<Loader2 class="h-6 w-6 animate-spin text-white" />
				{:else if radio.playing}
					<svg class="h-6 w-6 fill-white" viewBox="0 0 24 24">
						<rect x="6" y="5" width="4" height="14" rx="1" />
						<rect x="14" y="5" width="4" height="14" rx="1" />
					</svg>
				{:else}
					<svg class="h-6 w-6 fill-white ml-1" viewBox="0 0 24 24">
						<path d="M8 5v14l11-7z" />
					</svg>
				{/if}
			</Button>

			<div class="flex-1 min-w-0">
				<div class="text-sm font-medium">
					{#if radio.reconnecting}
						Переподключение…
					{:else if radio.playing}
						Слушаешь эфир
					{:else}
						Нажми, чтобы слушать
					{/if}
				</div>
				<a
					href={streamUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="text-xs text-muted-foreground hover:text-foreground flex items-center gap-2 mt-0.5 transition-colors group"
					title="Открыть поток в новой вкладке (например, для VLC)"
				>
					<ExternalLink class="h-3 w-3 group-hover:text-violet-400 transition-colors" />
					<span class="font-mono truncate">{streamUrl}</span>
				</a>
			</div>

			<div class="flex items-center gap-2 shrink-0">
				<Volume2 class="h-4 w-4 text-muted-foreground" />
				<input
					type="range"
					min="0"
					max="1"
					step="0.01"
					bind:value={volume}
					class="w-24 accent-violet-500"
				/>
			</div>
		</div>
	</div>

	<!-- History -->
	<Card>
		<CardHeader class="pb-3">
			<CardTitle class="text-sm flex items-center gap-2">
				<Music class="h-4 w-4 text-muted-foreground" />
				История эфира
				<span class="ml-auto text-xs font-normal text-muted-foreground">
					{history?.total ?? 0}
				</span>
			</CardTitle>
		</CardHeader>
		<CardContent class="p-0">
			{#if !history?.items?.length}
				<p class="text-xs text-muted-foreground text-center py-8">Ещё ничего не играло</p>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Трек</Table.Head>
							<Table.Head class="w-44">Когда</Table.Head>
							<Table.Head class="w-24 text-center">Статус</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each history.items as h (h.id)}
							<Table.Row>
								<Table.Cell>
									<div class="space-y-0.5">
										<div class="text-sm font-medium">{h.song_title ?? '—'}</div>
										{#if h.song_artist}
											<div class="text-xs text-muted-foreground">{h.song_artist}</div>
										{/if}
									</div>
								</Table.Cell>
								<Table.Cell class="text-xs text-muted-foreground">
									{formatDateTime(h.started_at)}
								</Table.Cell>
								<Table.Cell class="text-center">
									{#if h.skipped}
										<Badge variant="outline" class="text-[10px] border-amber-500/30 text-amber-400">
											пропущен
										</Badge>
									{:else}
										<Badge variant="outline" class="text-[10px] border-emerald-500/30 text-emerald-400">
											до конца
										</Badge>
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</CardContent>
	</Card>
</div>