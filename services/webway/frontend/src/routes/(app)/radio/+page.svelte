<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import NowPlaying from '$lib/components/ui/nowplaying';
	import { notify } from '$lib/utils/toast';
	import { formatDateTime } from '$lib/utils/format';
	import {
		Radio as RadioIcon, SkipForward, Volume2, Music, ExternalLink, Library
	} from 'lucide-svelte';

	let { data } = $props();

	let audioEl: HTMLAudioElement | null = $state(null);
	let playing = $state(false);
	let volume = $state(0.7);
	let skipping = $state(false);
	let now = $state(data.now);
	let history = $state(data.history);

	// Автообновление now + history
	$effect(() => {
		const id = setInterval(async () => {
			try {
				const [nowRes, histRes] = await Promise.all([
					fetch('/api/radio/now'),
					fetch('/api/radio/history?limit=20')
				]);
				if (nowRes.ok) now = await nowRes.json();
				if (histRes.ok) history = await histRes.json();
			} catch {}
		}, 5000);
		return () => clearInterval(id);
	});

	// Синхронизация volume с audio
	$effect(() => {
		if (audioEl) audioEl.volume = volume;
	});

	const streamUrl = '/radio/stream';

	function togglePlay() {
		if (!audioEl) return;
		if (playing) {
			audioEl.pause();
			playing = false;
		} else {
			audioEl.src = streamUrl + '?_=' + Date.now();
			audioEl.play().then(() => (playing = true)).catch((e) => {
				notify.error('Не удалось запустить поток');
			});
		}
	}

	async function skip() {
		skipping = true;
		try {
			const resp = await fetch('/api/radio/skip', { method: 'POST' });
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Трек пропущен');
			// Небольшая задержка — плеер подхватит новый трек сам
			setTimeout(async () => {
				const r = await fetch('/api/radio/now');
				if (r.ok) now = await r.json();
			}, 500);
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось пропустить');
		} finally {
			skipping = false;
		}
	}
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

	<!-- Now playing -->
	<NowPlaying now={now} onSkip={skip} canSkip={true} {skipping} />

	<!-- Player -->
	<div class="rounded-xl border bg-gradient-to-br from-card to-muted/20 p-5">
		<div class="flex items-center gap-4">
			<Button
				onclick={togglePlay}
				class="h-14 w-14 rounded-full shrink-0 bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 border-0"
			>
				{#if playing}
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
					{playing ? 'Слушаешь эфир' : 'Нажми, чтобы слушать'}
				</div>
				<div class="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
					<ExternalLink class="h-3 w-3" />
					<span class="font-mono truncate">{streamUrl}</span>
				</div>
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

		<audio bind:this={audioEl} preload="none"></audio>
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