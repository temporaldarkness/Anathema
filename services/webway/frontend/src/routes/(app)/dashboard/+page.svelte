<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import ServiceStatus from '$lib/components/ui/servicestatus';
	import { formatNumber, formatUptime } from '$lib/utils/format';
	import {
		Brain, Users, Hash, Smile, Zap, MessageSquare,
		Wallet, Cpu, Activity, ShieldCheck, ShieldAlert,
		Lock, Unlock, Eye, EyeOff, Image as ImageIcon, Power, Clock, Boxes
	} from 'lucide-svelte';

	let { data } = $props();

	const ov = $derived(data.overview);

	const statCards = $derived([
		{ key: 'ltm', label: 'Факты LTM', icon: Brain, color: 'text-violet-400' },
		{ key: 'users', label: 'Пользователи', icon: Users, color: 'text-blue-400' },
		{ key: 'channels', label: 'Каналы', icon: Hash, color: 'text-emerald-400' },
		{ key: 'emotes', label: 'Эмодзи', icon: Smile, color: 'text-amber-400' },
		{ key: 'keywords', label: 'Ключевые слова', icon: Zap, color: 'text-pink-400' },
		{ key: 'user_reactions', label: 'Реакции', icon: MessageSquare, color: 'text-cyan-400' }
	]);

	const services = $derived([
		{ key: 'memory', name: 'Memory Service' },
		{ key: 'history', name: 'History Service' },
		{ key: 'security', name: 'Security Service' },
		{ key: 'storage', name: 'Storage Service' }
	]);

	function formatBalance(b: number | null | undefined): string {
		if (b === null || b === undefined) return '—';
		return new Intl.NumberFormat('ru-RU', {
			style: 'currency',
			currency: 'RUB',
			maximumFractionDigits: 2
		}).format(b);
	}

	const balanceColor = $derived(
		!ov?.balance?.ok
			? 'text-muted-foreground'
			: (ov.balance.balance ?? 0) < 200
				? 'text-red-400'
				: (ov.balance.balance ?? 0) < 500
					? 'text-amber-400'
					: 'text-emerald-400'
	);
</script>

<svelte:head>
	<title>Дашборд — Anathema</title>
</svelte:head>

{#if !ov}
	<div class="space-y-6">
		<Skeleton class="h-8 w-56" />
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each Array(4) as _}<Skeleton class="h-24" />{/each}
		</div>
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each Array(6) as _}<Skeleton class="h-32" />{/each}
		</div>
	</div>
{:else}
	<div class="space-y-6">
		<!-- Заголовок -->
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold tracking-tight">Дашборд</h1>
				<p class="text-sm text-muted-foreground">Обзор состояния бота и сервисов</p>
			</div>
			{#if ov.bot_state.shutdown}
				<Badge variant="destructive" class="gap-1">
					<Power class="h-3 w-3" /> SHUTDOWN
				</Badge>
			{:else if ov.bot_state.preshutdown}
				<Badge class="gap-1 bg-amber-500/15 text-amber-400 border-amber-500/30">
					<Power class="h-3 w-3" /> Подготовка к выключению
				</Badge>
			{:else}
				<Badge class="gap-1 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
					<span class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
					Работает
				</Badge>
			{/if}
		</div>

		<!-- Сервисы -->
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each services as s}
				<ServiceStatus name={s.name} check={ov.services[s.key]} />
			{/each}
		</div>

		<!-- Состояние бота -->
		<div class="grid gap-4 lg:grid-cols-4">
			<!-- Модель -->
			<Card>
				<CardHeader class="pb-2">
					<CardTitle class="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
						<Cpu class="h-3.5 w-3.5" /> AI модель
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{ov.bot_state.model}</div>
					<p class="text-xs text-muted-foreground mt-1">
						Кэш: {ov.bot_state.caching_limit} · LTM лимит: {ov.bot_state.longterm_limit}
					</p>
				</CardContent>
			</Card>

			<!-- Баланс -->
			<Card>
				<CardHeader class="pb-2">
					<CardTitle class="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
						<Wallet class="h-3.5 w-3.5" /> Баланс ProxyAPI
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold {balanceColor}">
						{formatBalance(ov.balance.balance)}
					</div>
					{#if !ov.balance.ok}
						<p class="text-xs text-destructive mt-1 truncate" title={ov.balance.error}>
							{ov.balance.error ?? 'Ошибка'}
						</p>
					{:else if (ov.balance.balance ?? 0) < 200}
						<p class="text-xs text-red-400 mt-1">Критически низкий баланс</p>
					{:else}
						<p class="text-xs text-muted-foreground mt-1">Порог остановки: 200 ₽</p>
					{/if}
				</CardContent>
			</Card>

			<!-- Флаги -->
			<Card>
				<CardHeader class="pb-2">
					<CardTitle class="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
						<Activity class="h-3.5 w-3.5" /> Флаги
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="flex flex-wrap gap-1.5">
						<Badge
							variant="outline"
							class="gap-1 text-[10px] {ov.bot_state.thinking
								? 'border-violet-500/30 text-violet-400'
								: 'opacity-50'}"
						>
							{#if ov.bot_state.thinking}<Eye class="h-3 w-3" />{:else}<EyeOff class="h-3 w-3" />{/if}
							thinking
						</Badge>
						<Badge
							variant="outline"
							class="gap-1 text-[10px] {ov.bot_state.locked
								? 'border-amber-500/30 text-amber-400'
								: 'opacity-50'}"
						>
							{#if ov.bot_state.locked}<Lock class="h-3 w-3" />{:else}<Unlock class="h-3 w-3" />{/if}
							locked
						</Badge>
						<Badge
							variant="outline"
							class="gap-1 text-[10px] {ov.bot_state.longterm
								? 'border-emerald-500/30 text-emerald-400'
								: 'opacity-50'}"
						>
							<Brain class="h-3 w-3" /> longterm
						</Badge>
						<Badge
							variant="outline"
							class="gap-1 text-[10px] {ov.bot_state.awareness
								? 'border-blue-500/30 text-blue-400'
								: 'opacity-50'}"
						>
							{#if ov.bot_state.awareness}<ShieldCheck class="h-3 w-3" />{:else}<ShieldAlert class="h-3 w-3" />{/if}
							awareness
						</Badge>
						<Badge
							variant="outline"
							class="gap-1 text-[10px] {ov.bot_state.images
								? 'border-pink-500/30 text-pink-400'
								: 'opacity-50'}"
						>
							<ImageIcon class="h-3 w-3" /> images
						</Badge>
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader class="pb-2">
					<CardTitle class="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
						<Clock class="h-3.5 w-3.5" /> Uptime
					</CardTitle>
				</CardHeader>
				<CardContent>
					{#if ov.uptime.ok}
						<div class="text-2xl font-bold">{formatUptime(ov.uptime.uptime_seconds)}</div>
						<p class="text-xs text-muted-foreground mt-1">
							С {new Date(ov.uptime.boot_time).toLocaleString('ru-RU')}
						</p>
					{:else}
						<div class="text-2xl font-bold text-muted-foreground">—</div>
						<p class="text-xs text-muted-foreground mt-1">Нет данных</p>
					{/if}
				</CardContent>
			</Card>
		</div>

		<!-- Статистика -->
		<div>
			<h2 class="text-sm font-medium text-muted-foreground mb-3">Данные бота</h2>
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{#each statCards as card}
					<Card>
						<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle class="text-sm font-medium text-muted-foreground">
								{card.label}
							</CardTitle>
							<card.icon class="h-4 w-4 {card.color}" />
						</CardHeader>
						<CardContent>
							<div class="text-3xl font-bold">{ov.counts[card.key]}</div>
						</CardContent>
					</Card>
				{/each}
			</div>
		</div>
		
		<div>
			<h2 class="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
				<Boxes class="h-4 w-4" /> Kafka топики
				{#if ov.kafka.ok}
					<Badge variant="outline" class="text-[10px]">
						{ov.kafka.topics.length} топиков
					</Badge>
				{/if}
			</h2>

			{#if !ov.kafka.ok}
				<Card>
					<CardContent class="py-8 text-center text-sm text-destructive">
						Не удалось получить метрики Kafka: {ov.kafka.error}
					</CardContent>
				</Card>
			{:else}
				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{#each ov.kafka.topics as t (t.name)}
						<Card>
							<CardContent class="py-3 px-4">
								<div class="flex items-center justify-between mb-1">
									<code class="font-mono text-xs font-medium truncate">{t.name}</code>
									<Badge variant="outline" class="text-[10px] shrink-0">
										{t.partitions}p
									</Badge>
								</div>
								<div class="flex items-baseline gap-3">
									<div>
										<div class="text-lg font-bold">{formatNumber(t.total_messages)}</div>
										<div class="text-[10px] text-muted-foreground">всего</div>
									</div>
									<div class="ml-auto text-right">
										<div class="text-sm font-medium text-emerald-400">
											{formatNumber(t.live_messages)}
										</div>
										<div class="text-[10px] text-muted-foreground">доступно</div>
									</div>
								</div>
							</CardContent>
						</Card>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Recent -->
		<div class="grid gap-4 lg:grid-cols-2">
			<!-- Свежие LTM -->
			<Card>
				<CardHeader>
					<CardTitle class="text-base flex items-center gap-2">
						<Brain class="h-4 w-4 text-violet-400" />
						Свежие факты LTM
					</CardTitle>
				</CardHeader>
				<CardContent>
					{#if ov.recent.ltm.length === 0}
						<p class="text-sm text-muted-foreground text-center py-4">Память пуста</p>
					{:else}
						<ul class="space-y-2">
							{#each ov.recent.ltm as f (f.id)}
								<li class="flex items-start gap-2 text-sm">
									<span class="font-mono text-[10px] text-muted-foreground mt-1">#{f.id}</span>
									<span class="line-clamp-2 flex-1">{f.fact}</span>
								</li>
							{/each}
						</ul>
						<div class="mt-3 pt-3 border-t">
							<a href="/ltm" class="text-xs text-violet-400 hover:underline">
								Перейти к памяти →
							</a>
						</div>
					{/if}
				</CardContent>
			</Card>

			<!-- Пользователи -->
			<Card>
				<CardHeader>
					<CardTitle class="text-base flex items-center gap-2">
						<Users class="h-4 w-4 text-blue-400" />
						Пользователи
					</CardTitle>
				</CardHeader>
				<CardContent>
					{#if ov.recent.users.length === 0}
						<p class="text-sm text-muted-foreground text-center py-4">
							Нет зарегистрированных пользователей
						</p>
					{:else}
						<ul class="space-y-2">
							{#each ov.recent.users as u (u.uid)}
								<li class="flex items-center gap-2 text-sm">
									<span class="truncate font-medium">{u.username}</span>
									<span class="font-mono text-[10px] text-muted-foreground ml-auto">
										{u.uid}
									</span>
									{#if u.allowed}
										<ShieldCheck class="h-3 w-3 text-emerald-500 shrink-0" />
									{/if}
								</li>
							{/each}
						</ul>
						<div class="mt-3 pt-3 border-t">
							<a href="/users" class="text-xs text-blue-400 hover:underline">
								Все пользователи →
							</a>
						</div>
					{/if}
				</CardContent>
			</Card>
		</div>
	</div>
{/if}