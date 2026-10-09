<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import ActivityChart from '$lib/components/ui/activitychart';
	import TopList from '$lib/components/ui/toplist';
	import { formatNumber, formatUptime, formatUSD } from '$lib/utils/format';
	import {
		Brain, Users, Hash, Smile, Zap, MessageSquare,
		Wallet, Cpu, Activity, ShieldCheck, ShieldAlert,
		Lock, Unlock, Eye, EyeOff, Image as ImageIcon, Power, Clock, Boxes, TrendingUp, Coins,
		Server, Info, ArrowRight
	} from 'lucide-svelte';

	let { data } = $props();

	const ov = $derived(data.overview);

	const statCards = $derived([
    { key: 'ltm', label: 'Факты LTM', icon: Brain, color: 'text-violet-400', sub: 'долгосрочная память', href: '/ltm' },
    { key: 'users', label: 'Пользователи', icon: Users, color: 'text-blue-400', sub: 'в базе бота', href: '/users' },
    { key: 'channels', label: 'Каналы', icon: Hash, color: 'text-emerald-400', sub: 'с настройками', href: '/channels' },
    { key: 'emotes', label: 'Эмодзи', icon: Smile, color: 'text-amber-400', sub: 'в справочнике', href: '/emotes' },
    { key: 'keywords', label: 'Ключевые слова', icon: Zap, color: 'text-pink-400', sub: 'реакции по тексту', href: '/reactions?tab=keywords' },
    { key: 'user_reactions', label: 'Реакции', icon: MessageSquare, color: 'text-cyan-400', sub: 'привязки к юзерам', href: '/reactions?tab=users' }
]);

	const services = $derived([
		{ key: 'memory', name: 'Memory' },
		{ key: 'history', name: 'History' },
		{ key: 'security', name: 'Security' },
		{ key: 'storage', name: 'Storage' },
		{ key: 'audit', name: 'Audit' },
		{ key: 'radio', name: 'Radio' },
		{ key: 'tts', name: 'TTS' },
		{ key: 'webway_backend', name: 'Webway' }
	]);

	function formatBalance(b: number | null | undefined): string {
		if (b === null || b === undefined) return '—';
		return new Intl.NumberFormat('ru-RU', {
			style: 'currency', currency: 'RUB', maximumFractionDigits: 2
		}).format(b);
	}

	const balanceColor = $derived(
		!ov?.balance?.ok ? 'text-muted-foreground'
			: (ov.balance.balance ?? 0) < 200 ? 'text-red-400'
			: (ov.balance.balance ?? 0) < 500 ? 'text-amber-400'
			: 'text-emerald-400'
	);

	function serviceState(check: any): 'up' | 'down' | 'unknown' {
		if (!check || check.ok === null || check.ok === undefined) return 'unknown';
		return check.ok ? 'up' : 'down';
	}
</script>

<svelte:head>
	<title>Дашборд — Anathema</title>
</svelte:head>

{#if !ov}
	<div class="space-y-6">
		<Skeleton class="h-8 w-56" />
		<Skeleton class="h-12 w-full" />
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each Array(4) as _}<Skeleton class="h-24" />{/each}
		</div>
	</div>
{:else}
	<div class="space-y-8">
		<!-- ======================== HEADER ======================== -->
		<div class="flex items-start justify-between gap-4">
			<div>
				<h1 class="text-3xl font-bold tracking-tight">Дашборд</h1>
				<p class="text-sm text-muted-foreground mt-1">Обзор состояния бота и сервисов</p>
			</div>
			{#if ov.bot_state.shutdown}
				<Badge variant="destructive" class="gap-1.5 px-3 py-1.5">
					<Power class="h-3.5 w-3.5" /> SHUTDOWN
				</Badge>
			{:else if ov.bot_state.preshutdown}
				<Badge class="gap-1.5 px-3 py-1.5 bg-amber-500/15 text-amber-400 border-amber-500/30">
					<Power class="h-3.5 w-3.5" /> Подготовка к выключению
				</Badge>
			{:else}
				<Badge class="gap-1.5 px-3 py-1.5 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
					<span class="relative flex h-2 w-2">
						<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
						<span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
					</span>
					Работает
				</Badge>
			{/if}
		</div>

		<!-- ======================== SYSTEM ======================== -->
		<section class="space-y-3">
			<h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Система
			</h2>
			<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<!-- AI model -->
				<Card>
					<CardHeader class="pb-2">
						<CardTitle class="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
							<Cpu class="h-3.5 w-3.5" /> AI модель
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div class="text-2xl font-bold truncate">{ov.bot_state.model ?? '—'}</div>
						<p class="text-[11px] text-muted-foreground mt-1.5">
							Кэш {ov.bot_state.caching_limit ?? '—'}
							<span class="text-muted-foreground/40 mx-1">·</span>
							LTM {ov.bot_state.longterm_limit ?? '—'}
						</p>
					</CardContent>
				</Card>

				<!-- Balance -->
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
							<p class="text-[11px] text-destructive mt-1.5 truncate" title={ov.balance.error}>
								{ov.balance.error ?? 'Ошибка запроса'}
							</p>
						{:else if (ov.balance.balance ?? 0) < 200}
							<p class="text-[11px] text-red-400 mt-1.5">Критически низкий</p>
						{:else}
							<p class="text-[11px] text-muted-foreground mt-1.5">Порог: 200 ₽</p>
						{/if}
					</CardContent>
				</Card>

				<!-- Uptime -->
				<Card>
					<CardHeader class="pb-2">
						<CardTitle class="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
							<Clock class="h-3.5 w-3.5" /> Uptime бота
						</CardTitle>
					</CardHeader>
					<CardContent>
						{#if ov.uptime.ok}
							<div class="text-2xl font-bold">{formatUptime(ov.uptime.uptime_seconds)}</div>
							<p class="text-[11px] text-muted-foreground mt-1.5">
								с {new Date(ov.uptime.boot_time).toLocaleString('ru-RU', {
									day: '2-digit', month: '2-digit',
									hour: '2-digit', minute: '2-digit'
								})}
							</p>
						{:else}
							<div class="text-2xl font-bold text-muted-foreground">—</div>
							<p class="text-[11px] text-muted-foreground mt-1.5">нет данных</p>
						{/if}
					</CardContent>
				</Card>

				<!-- Flags -->
				<Card>
					<CardHeader class="pb-2">
						<CardTitle class="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
							<Activity class="h-3.5 w-3.5" /> Флаги
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div class="flex flex-wrap gap-1">
							<Badge
								variant="outline"
								class="gap-1 text-[10px] px-1.5 py-0 {ov.bot_state.thinking
									? 'border-violet-500/30 text-violet-400'
									: 'opacity-40'}"
							>
								{#if ov.bot_state.thinking}<Eye class="h-2.5 w-2.5" />{:else}<EyeOff class="h-2.5 w-2.5" />{/if}
								think
							</Badge>
							<Badge
								variant="outline"
								class="gap-1 text-[10px] px-1.5 py-0 {ov.bot_state.locked
									? 'border-amber-500/30 text-amber-400'
									: 'opacity-40'}"
							>
								{#if ov.bot_state.locked}<Lock class="h-2.5 w-2.5" />{:else}<Unlock class="h-2.5 w-2.5" />{/if}
								lock
							</Badge>
							<Badge
								variant="outline"
								class="gap-1 text-[10px] px-1.5 py-0 {ov.bot_state.longterm
									? 'border-emerald-500/30 text-emerald-400'
									: 'opacity-40'}"
							>
								<Brain class="h-2.5 w-2.5" /> ltm
							</Badge>
							<Badge
								variant="outline"
								class="gap-1 text-[10px] px-1.5 py-0 {ov.bot_state.awareness
									? 'border-blue-500/30 text-blue-400'
									: 'opacity-40'}"
							>
								{#if ov.bot_state.awareness}<ShieldCheck class="h-2.5 w-2.5" />{:else}<ShieldAlert class="h-2.5 w-2.5" />{/if}
								aware
							</Badge>
							<Badge
								variant="outline"
								class="gap-1 text-[10px] px-1.5 py-0 {ov.bot_state.images
									? 'border-pink-500/30 text-pink-400'
									: 'opacity-40'}"
							>
								<ImageIcon class="h-2.5 w-2.5" /> img
							</Badge>
						</div>
					</CardContent>
				</Card>
			</div>
		</section>
		
		<!-- ======================== SERVICES STRIP ======================== -->
		<div class="flex flex-wrap items-center gap-2">
			{#each services as s}
				{@const c = ov.services[s.key]}
				{@const st = serviceState(c)}
				<div
					class="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs transition-colors hover:border-primary/30"
					title={c?.error ?? `${s.name} Service`}
				>
					{#if st === 'up'}
						<span class="relative flex h-2 w-2">
							<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50"></span>
							<span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
						</span>
					{:else if st === 'down'}
						<span class="relative inline-flex h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px] shadow-red-500/50"></span>
					{:else}
						<span class="relative inline-flex h-2 w-2 rounded-full bg-muted-foreground/40"></span>
					{/if}
					<span class="font-medium">{s.name}</span>
					{#if c?.latency_ms != null}
						<span class="font-mono text-muted-foreground">{c.latency_ms.toFixed(0)}ms</span>
					{/if}
					{#if c?.uptime_seconds != null}
						<span class="text-muted-foreground/40">·</span>
						<span class="text-muted-foreground">{formatUptime(c.uptime_seconds)}</span>
					{/if}
				</div>
			{/each}
		</div>
		<!-- Background workers (heartbeat) -->
		{#if data.heartbeats?.services?.length}
			<div class="flex flex-wrap items-center gap-2">
				{#each data.heartbeats.services as w (w.service)}
					<div
						class="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs transition-colors hover:border-primary/30"
						title={w.seconds_since !== null
							? `Последний heartbeat: ${w.seconds_since} сек назад`
							: 'Никогда не отвечал'}
					>
						{#if w.alive}
							<span class="relative flex h-2 w-2">
								<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50"></span>
								<span class="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
							</span>
						{:else}
							<span class="relative inline-flex h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px] shadow-red-500/50"></span>
						{/if}
						<span class="font-medium">{w.label}</span>
						{#if w.seconds_since !== null && !w.alive}
							<span class="font-mono text-muted-foreground">
								{Math.round(w.seconds_since)}s
							</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}

		<!-- ======================== BOT DATA ======================== -->
		<section class="space-y-3">
			<h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Данные бота
			</h2>
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
				{#each statCards as card}
					<a
						href={card.href}
						class="group block rounded-xl border bg-card text-card-foreground transition-colors hover:border-primary/40 hover:bg-accent/30"
					>
						<div class="p-4">
							<div class="flex items-start justify-between">
								<card.icon class="h-4 w-4 {card.color}" />
								<ArrowRight class="h-3 w-3 text-muted-foreground/40 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
							</div>
							<div class="mt-3">
								<div class="text-3xl font-bold tabular-nums">{ov.counts[card.key] ?? 0}</div>
								<div class="text-xs font-medium mt-0.5">{card.label}</div>
								<div class="text-[10px] text-muted-foreground mt-0.5">{card.sub}</div>
							</div>
						</div>
					</a>
				{/each}
			</div>
		</section>

		<!-- ======================== KAFKA ======================== -->
		<section class="space-y-3">
			<div class="flex items-center gap-2">
				<h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					Kafka топики
				</h2>
				{#if ov.kafka.ok}
					<Badge variant="outline" class="text-[10px] px-1.5 py-0">
						{ov.kafka.topics.length}
					</Badge>
				{/if}
			</div>

			{#if !ov.kafka.ok}
				<Card class="border-dashed">
					<CardContent class="py-10 text-center">
						<Server class="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
						<p class="text-sm font-medium">Метрики Kafka недоступны</p>
						<p class="text-xs text-muted-foreground mt-1">
							Проверьте <code class="font-mono text-[10px] px-1 py-0.5 rounded bg-muted">KAFKA_BOOTSTRAP_SERVERS</code>
							в конфигурации Webway.
						</p>
					</CardContent>
				</Card>
			{:else}
				<Card>
					<CardContent class="p-0 divide-y">
						{#each ov.kafka.topics as t (t.name)}
							<div class="flex items-center gap-4 px-4 py-3 hover:bg-accent/30 transition-colors">
								<Boxes class="h-4 w-4 text-muted-foreground shrink-0" />
								<div class="flex-1 min-w-0">
									<code class="font-mono text-xs font-medium truncate block">{t.name}</code>
								</div>
								<Badge variant="outline" class="text-[10px] shrink-0">
									{t.partitions}p
								</Badge>
								<div class="flex items-center gap-6 shrink-0">
									<div class="text-right">
										<div class="text-sm font-mono tabular-nums">{formatNumber(t.total_messages)}</div>
										<div class="text-[10px] text-muted-foreground">всего</div>
									</div>
									<div class="text-right">
										<div class="text-sm font-mono tabular-nums text-emerald-400">
											{formatNumber(t.live_messages)}
										</div>
										<div class="text-[10px] text-muted-foreground">живых</div>
									</div>
								</div>
							</div>
						{/each}
					</CardContent>
				</Card>
			{/if}
		</section>

		<!-- ======================== RECENT ======================== -->
		<section class="space-y-3">
			<h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Последние изменения
			</h2>
			<div class="grid gap-4 lg:grid-cols-2">
				<Card>
					<CardHeader class="pb-3">
						<CardTitle class="text-sm flex items-center gap-2">
							<Brain class="h-4 w-4 text-violet-400" />
							Свежие факты LTM
							<span class="ml-auto text-xs font-normal text-muted-foreground">
								{ov.recent.ltm.length}
							</span>
						</CardTitle>
					</CardHeader>
					<CardContent>
						{#if ov.recent.ltm.length === 0}
							<p class="text-xs text-muted-foreground text-center py-4">Память пуста</p>
						{:else}
							<ul class="space-y-2.5">
								{#each ov.recent.ltm as f (f.id)}
									<li class="flex items-start gap-2 text-sm leading-snug">
										<span class="font-mono text-[10px] text-muted-foreground mt-1 shrink-0">#{f.id}</span>
										<span class="line-clamp-2 flex-1">{f.fact}</span>
									</li>
								{/each}
							</ul>
							<a href="/ltm" class="mt-3 pt-3 border-t flex items-center justify-between text-xs text-violet-400 hover:text-violet-300 transition-colors">
								Перейти к памяти <ArrowRight class="h-3 w-3" />
							</a>
						{/if}
					</CardContent>
				</Card>

				<Card>
					<CardHeader class="pb-3">
						<CardTitle class="text-sm flex items-center gap-2">
							<Users class="h-4 w-4 text-blue-400" />
							Пользователи
							<span class="ml-auto text-xs font-normal text-muted-foreground">
								{ov.recent.users.length}
							</span>
						</CardTitle>
					</CardHeader>
					<CardContent>
						{#if ov.recent.users.length === 0}
							<p class="text-xs text-muted-foreground text-center py-4">Нет пользователей</p>
						{:else}
							<ul class="space-y-2.5">
								{#each ov.recent.users as u (u.uid)}
									<li class="flex items-center gap-2 text-sm">
										<span class="truncate font-medium">{u.username}</span>
										<span class="font-mono text-[10px] text-muted-foreground ml-auto shrink-0">
											{u.uid}
										</span>
										{#if u.allowed}
											<ShieldCheck class="h-3 w-3 text-emerald-500 shrink-0" />
										{/if}
									</li>
								{/each}
							</ul>
							<a href="/users" class="mt-3 pt-3 border-t flex items-center justify-between text-xs text-blue-400 hover:text-blue-300 transition-colors">
								Все пользователи <ArrowRight class="h-3 w-3" />
							</a>
						{/if}
					</CardContent>
				</Card>
			</div>
		</section>

		<!-- ======================== ANALYTICS ======================== -->
		<section class="space-y-3">
			<h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
				<TrendingUp class="h-3.5 w-3.5" /> Аналитика активности
			</h2>

			{#if data.analytics?.summary}
				<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
					<Card>
						<CardContent class="p-4">
							<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Всего</div>
							<div class="text-2xl font-bold mt-1 tabular-nums">{formatNumber(data.analytics.summary.total)}</div>
							<div class="text-[10px] text-muted-foreground">сообщений</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent class="p-4">
							<div class="text-[10px] uppercase tracking-wider text-muted-foreground">За 24 часа</div>
							<div class="text-2xl font-bold mt-1 tabular-nums text-blue-400">{formatNumber(data.analytics.summary.today)}</div>
							<div class="text-[10px] text-muted-foreground">сообщений</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent class="p-4">
							<div class="text-[10px] uppercase tracking-wider text-muted-foreground">За 7 дней</div>
							<div class="text-2xl font-bold mt-1 tabular-nums text-violet-400">{formatNumber(data.analytics.summary.week)}</div>
							<div class="text-[10px] text-muted-foreground">сообщений</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent class="p-4">
							<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Уникальных</div>
							<div class="text-2xl font-bold mt-1 tabular-nums text-cyan-400">{data.analytics.summary.unique_users_today}</div>
							<div class="text-[10px] text-muted-foreground">юзеров за 24ч</div>
						</CardContent>
					</Card>
				</div>
			{/if}

			<ActivityChart
				title="Сообщения за последние 24 часа"
				buckets={data.analytics?.timeline?.buckets ?? null}
				hours={24}
				loading={!data.analytics}
			/>

			<div class="grid gap-4 lg:grid-cols-2">
				<TopList
					title="Активные пользователи (24ч)"
					icon={Users}
					items={(data.analytics?.top_users?.users ?? []).map((u: any) => ({
						label: u.username,
						sublabel: String(u.user_id),
						count: u.count
					}))}
					loading={!data.analytics}
				/>
				<TopList
					title="Активные каналы (24ч)"
					icon={Hash}
					items={(data.analytics?.top_channels?.channels ?? []).map((c: any) => {
						const cid = String(c.channel_id);
						const known = data.analytics?.channels_map?.[cid];
						return {
							label: known?.human_name ? `#${known.human_name}` : `#${cid}`,
							sublabel: known?.human_name ? cid : undefined,
							count: c.count
						};
					})}
					loading={!data.analytics}
				/>
			</div>

			{#if data.analytics?.audit_timeline?.buckets}
				<ActivityChart
					title="Действия администраторов за 7 дней"
					buckets={data.analytics.audit_timeline.buckets.map((b: any) => ({
						bucket: b.bucket,
						count: b.total
					}))}
					unit="действий"
					hours={24 * 7}
					loading={false}
				/>
			{/if}
		</section>

		<!-- ======================== SPENDING ======================== -->
		{#if data.spending}
			<section class="space-y-3">
				<h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
					<Coins class="h-3.5 w-3.5" /> Расход на AI · {data.spending.days} дней
				</h2>

				{#if data.spending.summary}
					<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
						<Card>
							<CardContent class="p-4">
								<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Потрачено</div>
								<div class="text-2xl font-bold mt-1 tabular-nums text-amber-400">
									{formatUSD(data.spending.summary.cost_usd)}
								</div>
								<div class="text-[10px] text-muted-foreground">за период</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent class="p-4">
								<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Вызовов</div>
								<div class="text-2xl font-bold mt-1 tabular-nums">{formatNumber(data.spending.summary.calls)}</div>
								{#if data.spending.summary.failures > 0}
									<div class="text-[10px] text-destructive">{data.spending.summary.failures} ошибок</div>
								{:else}
									<div class="text-[10px] text-muted-foreground">без ошибок</div>
								{/if}
							</CardContent>
						</Card>
						<Card>
							<CardContent class="p-4">
								<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Input</div>
								<div class="text-2xl font-bold mt-1 tabular-nums text-blue-400">
									{formatNumber(data.spending.summary.tokens_in)}
								</div>
								<div class="text-[10px] text-muted-foreground">токенов</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent class="p-4">
								<div class="text-[10px] uppercase tracking-wider text-muted-foreground">Output</div>
								<div class="text-2xl font-bold mt-1 tabular-nums text-violet-400">
									{formatNumber(data.spending.summary.tokens_out)}
								</div>
								<div class="text-[10px] text-muted-foreground">токенов</div>
							</CardContent>
						</Card>
					</div>
				{/if}

				{#if data.spending.by_model?.items?.length > 0}
					<Card>
						<CardHeader class="pb-3">
							<CardTitle class="text-sm">По моделям</CardTitle>
						</CardHeader>
						<CardContent>
							<ul class="space-y-3">
								{#each data.spending.by_model.items as m}
									<li>
										<div class="flex items-center justify-between mb-1.5 text-xs">
											<code class="font-mono truncate">{m.model}</code>
											<div class="flex items-center gap-3 shrink-0 ml-2">
												<span class="text-muted-foreground tabular-nums">{m.calls}</span>
												<span class="font-medium text-amber-400 tabular-nums">{formatUSD(m.cost_usd)}</span>
											</div>
										</div>
										<div class="h-1.5 rounded-full bg-muted overflow-hidden">
											<div
												class="h-full bg-gradient-to-r from-amber-500/60 to-amber-400 rounded-full"
												style="width: {Math.max(2, (m.cost_usd / Math.max(0.0001, ...data.spending.by_model.items.map((x: any) => x.cost_usd))) * 100)}%"
											></div>
										</div>
									</li>
								{/each}
							</ul>
						</CardContent>
					</Card>
				{/if}

				<div class="grid gap-4 lg:grid-cols-2">
					{#if data.spending.by_source?.items?.length > 0}
						<Card>
							<CardHeader class="pb-3">
								<CardTitle class="text-sm">По источникам</CardTitle>
							</CardHeader>
							<CardContent>
								<ul class="space-y-1.5 text-xs">
									{#each data.spending.by_source.items as s}
										<li class="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
											<code class="font-mono">{s.source}</code>
											<div class="flex items-center gap-3 shrink-0">
												<span class="text-muted-foreground tabular-nums">{s.calls}</span>
												<span class="font-medium text-amber-400 tabular-nums">{formatUSD(s.cost_usd)}</span>
											</div>
										</li>
									{/each}
								</ul>
							</CardContent>
						</Card>
					{/if}

					{#if data.spending.top_users?.users?.length > 0}
						<Card>
							<CardHeader class="pb-3">
								<CardTitle class="text-sm">Топ юзеров</CardTitle>
							</CardHeader>
							<CardContent>
								<ul class="space-y-1.5 text-xs">
									{#each data.spending.top_users.users as u, i}
										<li class="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
											<div class="flex items-center gap-2 min-w-0">
												<span class="font-mono text-muted-foreground w-4 shrink-0">{i + 1}.</span>
												<span class="font-mono truncate">{u.user_id}</span>
											</div>
											<div class="flex items-center gap-3 shrink-0 ml-2">
												<span class="text-muted-foreground tabular-nums">{u.calls}</span>
												<span class="font-medium text-amber-400 tabular-nums">{formatUSD(u.cost_usd)}</span>
											</div>
										</li>
									{/each}
								</ul>
							</CardContent>
						</Card>
					{/if}
				</div>
			</section>
		{/if}
	</div>
{/if}