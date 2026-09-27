<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import NowPlaying from '$lib/components/ui/nowplaying';
	import { notify } from '$lib/utils/toast';
	import { formatDateTime } from '$lib/utils/format';
	import {
		Radio as RadioIcon, Volume2, Music, ExternalLink, Library,
		Loader2
	} from 'lucide-svelte';

	let { data } = $props();

	let audioEl: HTMLAudioElement | null = $state(null);
	let playing = $state(false);
	let reconnecting = $state(false);
	let volume = $state(0.7);
	let skipping = $state(false);
	let now = $state(data.now);
	let history = $state(data.history);

	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let lastCurrentTime = 0;
	let lastProgressAt = Date.now();

	const streamUrl = '/radio/stream';

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

	$effect(() => {
		if (audioEl) audioEl.volume = volume;
	});

	function buildStreamUrl() {
		// Anti-cache: случайный суффикс, чтобы браузер гарантированно шёл за новым потоком
		return `${streamUrl}?_=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	}

	function cancelReconnect() {
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
			reconnectTimer = null;
		}
	}

	async function startStream() {
		if (!audioEl) return;
		cancelReconnect();
		reconnecting = true;
		try {
			// Полностью сбрасываем элемент — иначе браузер может держать
			// подвисшее TCP-соединение к Icecast
			audioEl.pause();
			audioEl.removeAttribute('src');
			audioEl.load();
			await new Promise((r) => setTimeout(r, 120));

			audioEl.src = buildStreamUrl();
			audioEl.load();
			await audioEl.play();

			playing = true;
			lastProgressAt = Date.now();
			lastCurrentTime = 0;
		} catch (e) {
			console.warn('stream start failed', e);
			playing = false;
		} finally {
			reconnecting = false;
		}
	}

	function stopStream() {
		if (!audioEl) return;
		cancelReconnect();
		audioEl.pause();
		audioEl.removeAttribute('src');
		audioEl.load();
		playing = false;
	}

	function scheduleReconnect(delay = 300) {
		if (!playing) return;
		if (reconnecting) return;
		if (reconnectTimer) return;
		reconnectTimer = setTimeout(() => {
			reconnectTimer = null;
			if (!playing) return;
			startStream();
		}, delay);
	}

	function togglePlay() {
		if (playing) stopStream();
		else startStream();
	}

	$effect(() => {
		if (!playing || !audioEl) return;
		const id = setInterval(() => {
			if (!playing || !audioEl) return;
			if (audioEl.paused) {
				// Мы считаем что играем, но элемент на паузе — значит завис
				scheduleReconnect(200);
				return;
			}
			const t = audioEl.currentTime;
			if (t > lastCurrentTime) {
				lastCurrentTime = t;
				lastProgressAt = Date.now();
			} else if (Date.now() - lastProgressAt > 2500) {
				// Не движется 2.5 сек — переподключаемся
				scheduleReconnect(150);
			}
		}, 1200);
		return () => clearInterval(id);
	});

	$effect(() => {
		if (!audioEl) return;

		const onEnded = () => scheduleReconnect(150);
		const onError = () => scheduleReconnect(400);
		const onStalled = () => scheduleReconnect(800);
		const onPlaying = () => {
			lastProgressAt = Date.now();
		};
		const onPause = () => {
			// pause может быть вызван нашими же startStream — не считаем за зависание
		};

		audioEl.addEventListener('ended', onEnded);
		audioEl.addEventListener('error', onError);
		audioEl.addEventListener('stalled', onStalled);
		audioEl.addEventListener('playing', onPlaying);
		audioEl.addEventListener('pause', onPause);

		return () => {
			audioEl.removeEventListener('ended', onEnded);
			audioEl.removeEventListener('error', onError);
			audioEl.removeEventListener('stalled', onStalled);
			audioEl.removeEventListener('playing', onPlaying);
			audioEl.removeEventListener('pause', onPause);
		};
	});

	async function skip() {
		skipping = true;
		try {
			const resp = await fetch('/api/radio/skip', { method: 'POST' });
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Трек пропущен');
			setTimeout(async () => {
				try {
					const r = await fetch('/api/radio/now');
					if (r.ok) now = await r.json();
				} catch {}
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
				disabled={reconnecting}
				class="h-14 w-14 rounded-full shrink-0 bg-gradient-to-br from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 border-0"
			>
				{#if reconnecting}
					<Loader2 class="h-6 w-6 animate-spin text-white" />
				{:else if playing}
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
					{#if reconnecting}
						Переподключение…
					{:else if playing}
						Слушаешь эфир
					{:else}
						Нажми, чтобы слушать
					{/if}
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