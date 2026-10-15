<script lang="ts">
	import { onMount } from 'svelte';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import {
		Sword, Users, History, Globe, ExternalLink, Trophy, Sparkles, ChevronRight
	} from 'lucide-svelte';

	let live = $state<{
		loading: boolean;
		authenticated: boolean;
		matches: number | null;
		wins: number | null;
		rating: number | null;
		tier: string | null;
	}>({
		loading: true,
		authenticated: false,
		matches: null,
		wins: null,
		rating: null,
		tier: null,
	});

	onMount(async () => {
		try {
			const session = await fetch('/games/aspects/api/session', {
				credentials: 'include'
			}).then((r) => r.json());

			if (session?.kind !== 'authenticated') {
				live = { ...live, loading: false, authenticated: false };
				return;
			}

			const [rating, matches] = await Promise.all([
				fetch('/games/aspects/api/rating/me', { credentials: 'include' })
					.then((r) => (r.ok ? r.json() : null))
					.catch(() => null),
				fetch('/games/aspects/api/matches', { credentials: 'include' })
					.then((r) => (r.ok ? r.json() : []))
					.catch(() => []),
			]);

			live = {
				loading: false,
				authenticated: true,
				matches: Array.isArray(matches) ? matches.length : 0,
				wins: rating?.wins ?? 0,
				rating: rating?.rating ?? null,
				tier: rating?.tier ?? null,
			};
		} catch {
			live = { ...live, loading: false, authenticated: false };
		}
	});

	const features = [
		{ icon: Sword, text: 'Пятиколоночное поле, контроль нейтральных клеток' },
		{ icon: Sparkles, text: 'Аспекты одной Личности — обмен карты на карту' },
		{ icon: Globe, text: 'Онлайн-партии, матчмейкинг, спектейт' },
		{ icon: Users, text: 'Колоды, друзья, рейтинг ELO' },
	];
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold tracking-tight">Игры</h1>
		<p class="text-sm text-muted-foreground">Внутренние игры Анафемы</p>
	</div>

	<Card class="overflow-hidden">
		<!-- Top accent -->
		<div class="h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-blue-500"></div>

		<CardHeader class="pb-3">
			<CardTitle class="flex items-center gap-2 flex-wrap">
				<div class="rounded-lg bg-violet-500/15 p-2 ring-1 ring-violet-500/30">
					<Sword class="h-5 w-5 text-violet-400" />
				</div>
				<span class="text-xl">Аспекты Штормграда</span>
				<Badge variant="outline" class="text-[10px] border-violet-500/30 text-violet-300">
					beta
				</Badge>
			</CardTitle>
		</CardHeader>

		<CardContent class="space-y-5">
			<p class="text-sm text-muted-foreground leading-relaxed max-w-2xl">
				Коллекционная карточная игра 1v1. Собирай колоды из 30 карт,
				сражайся на пятиколоночном поле, контролируй нейтральные клетки.
				Каждая Личность может проявляться в разных Аспектах —
				меняй карты на ходу.
			</p>

			<!-- Features -->
			<div class="grid gap-2 sm:grid-cols-2">
				{#each features as f}
					<div class="flex items-start gap-2.5 rounded-lg border bg-card/40 px-3 py-2.5">
						<f.icon class="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />
						<span class="text-xs text-muted-foreground leading-snug">{f.text}</span>
					</div>
				{/each}
			</div>

			<!-- Live stats -->
			{#if live.loading}
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
					{#each Array(4) as _}
						<Skeleton class="h-16 rounded-lg" />
					{/each}
				</div>
			{:else if live.authenticated}
				<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
					<div class="rounded-lg border bg-card/40 px-3 py-2.5">
						<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Матчей</div>
						<div class="text-xl font-bold tabular-nums mt-1">{live.matches ?? 0}</div>
					</div>
					<div class="rounded-lg border bg-card/40 px-3 py-2.5">
						<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Побед</div>
						<div class="text-xl font-bold tabular-nums mt-1 text-emerald-400">{live.wins ?? 0}</div>
					</div>
					<div class="rounded-lg border bg-card/40 px-3 py-2.5">
						<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Рейтинг</div>
						<div class="text-xl font-bold tabular-nums mt-1">{live.rating ?? '—'}</div>
					</div>
					<div class="rounded-lg border bg-card/40 px-3 py-2.5">
						<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Уровень</div>
						<div class="text-sm font-semibold mt-1.5 text-violet-300">{live.tier ?? '—'}</div>
					</div>
				</div>
			{/if}

			<!-- Actions -->
			<div class="flex flex-wrap gap-2 pt-1">
				<a href="/games/aspects/">
					<Button class="gap-2 bg-violet-600 hover:bg-violet-500 text-white">
						<ExternalLink class="h-4 w-4" />
						Играть
					</Button>
				</a>
				<a href="/games/aspects/decks">
					<Button variant="outline" class="gap-2">
						<Users class="h-4 w-4" /> Колоды
					</Button>
				</a>
				<a href="/games/aspects/history">
					<Button variant="outline" class="gap-2">
						<History class="h-4 w-4" /> История
					</Button>
				</a>
				<a href="/games/aspects/leaderboard">
					<Button variant="outline" class="gap-2">
						<Trophy class="h-4 w-4" /> Рейтинг
					</Button>
				</a>
			</div>

			{#if !live.loading && !live.authenticated}
				<div class="rounded-lg border border-dashed bg-card/20 px-3 py-2 text-[11px] text-muted-foreground">
					Вход через Webway — прогресс, колоды и рейтинг синхронизируются между устройствами.
				</div>
			{/if}
		</CardContent>
	</Card>

	<!-- Hint -->
	<div class="flex items-center gap-2 text-[11px] text-muted-foreground/70 px-1">
		<ChevronRight class="h-3 w-3" />
		Игра открывается в этой же панели. Все настройки и разделы — внутри.
	</div>
</div>