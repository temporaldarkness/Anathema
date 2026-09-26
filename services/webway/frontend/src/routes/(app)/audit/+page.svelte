<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Input } from '$lib/components/ui/input';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { formatDateTime } from '$lib/utils/format';
	import {
		ScrollText, Search, X, CheckCircle2, XCircle, ChevronLeft, ChevronRight,
		User as UserIcon, Activity, Globe, AlertTriangle
	} from 'lucide-svelte';

	let { data } = $props();

	let detailsEntry = $state<any>(null);
	let actorSearch = $state(page.url.searchParams.get('search') ?? '');
	const PAGE_SIZE = 50;

	const items = $derived(data.audit?.items ?? []);
	const total = $derived(data.audit?.total ?? 0);
	const currentOffset = $derived(Number(page.url.searchParams.get('offset') ?? '0'));
	const currentPage = $derived(Math.floor(currentOffset / PAGE_SIZE) + 1);
	const totalPages = $derived(Math.max(1, Math.ceil(total / PAGE_SIZE)));

	const entityFilter = $derived(page.url.searchParams.get('entity_type') ?? 'all');
	const actionFilter = $derived(page.url.searchParams.get('action') ?? 'all');
	const successFilter = $derived(page.url.searchParams.get('success') ?? 'all');
	const sourceFilter = $derived(page.url.searchParams.get('source_service') ?? 'all');

	const ENTITY_OPTIONS = [
		'all', 'user', 'channel', 'emote', 'ltm', 'setting', 'keyword', 'user_reaction', 'file'
	];
	const ACTION_OPTIONS = ['all', 'create', 'update', 'delete', 'reset', 'upsert'];
	const SOURCE_OPTIONS = ['all', 'webway', 'gateway', 'admin_service'];

	function updateParam(key: string, value: string | null) {
		const params = new URLSearchParams(page.url.searchParams);
		if (!value || value === 'all' || value === '') {
			params.delete(key);
		} else {
			params.set(key, value);
		}
		params.delete('offset');
		goto(`?${params}`, { keepFocus: true, noScroll: true });
	}

	function setPage(p: number) {
		const params = new URLSearchParams(page.url.searchParams);
		params.set('offset', String((p - 1) * PAGE_SIZE));
		goto(`?${params}`, { keepFocus: true, noScroll: true, replaceState: true });
	}

	function clearFilters() {
		goto('?', { keepFocus: true, noScroll: true, replaceState: true });
		actorSearch = '';
	}

	const hasFilters = $derived(
		!!actorSearch ||
			entityFilter !== 'all' ||
			actionFilter !== 'all' ||
			successFilter !== 'all' ||
			sourceFilter !== 'all'
	);

	function actionColor(action: string) {
		switch (action) {
			case 'create':
				return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
			case 'update':
				return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
			case 'delete':
				return 'bg-red-500/15 text-red-400 border-red-500/30';
			case 'reset':
				return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
			case 'upsert':
				return 'bg-violet-500/15 text-violet-400 border-violet-500/30';
			default:
				return '';
		}
	}

	function sourceColor(source: string) {
		switch (source) {
			case 'webway':
				return 'bg-violet-500/15 text-violet-400 border-violet-500/30';
			case 'gateway':
				return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
			case 'admin_service':
				return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
			default:
				return '';
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Журнал действий</h1>
			<p class="text-sm text-muted-foreground">Кто, что и когда менял в системе</p>
		</div>
		{#if data.stats}
			<Badge variant="outline" class="gap-1">
				<Activity class="h-3 w-3" />
				{data.stats.last_24h} за 24ч
			</Badge>
		{/if}
	</div>

	<!-- Статистика -->
	{#if data.stats}
		<div class="grid gap-4 sm:grid-cols-3">
			<Card>
				<CardHeader class="pb-2">
					<CardTitle class="text-xs font-medium text-muted-foreground">
						Всего записей
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold">{data.stats.total}</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader class="pb-2">
					<CardTitle class="text-xs font-medium text-muted-foreground">За 24 часа</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="text-2xl font-bold text-blue-400">{data.stats.last_24h}</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader class="pb-2">
					<CardTitle class="text-xs font-medium text-muted-foreground flex items-center gap-1">
						<AlertTriangle class="h-3 w-3" /> Ошибок
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div
						class="text-2xl font-bold {data.stats.failures > 0 ? 'text-red-400' : ''}"
					>
						{data.stats.failures}
					</div>
				</CardContent>
			</Card>
		</div>
	{/if}

	<!-- Фильтры -->
	<Card>
		<CardContent class="py-4">
			<div class="flex flex-wrap items-center gap-3">
				<div class="relative flex-1 min-w-48">
					<Search
						class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						placeholder="Поиск по имени, entity_id, ошибке..."
						bind:value={actorSearch}
						class="pl-9"
						onkeydown={(e) => {
							if (e.key === 'Enter') updateParam('search', actorSearch);
						}}
						onblur={() => updateParam('search', actorSearch)}
					/>
				</div>

				<Select.Root
					type="single"
					value={entityFilter}
					onValueChange={(v) => v && updateParam('entity_type', v)}
				>
					<Select.Trigger class="w-40">
						{entityFilter === 'all' ? 'Все объекты' : entityFilter}
					</Select.Trigger>
					<Select.Content>
						{#each ENTITY_OPTIONS as opt}
							<Select.Item value={opt} label={opt === 'all' ? 'Все объекты' : opt}>
								{opt === 'all' ? 'Все объекты' : opt}
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>

				<Select.Root
					type="single"
					value={actionFilter}
					onValueChange={(v) => v && updateParam('action', v)}
				>
					<Select.Trigger class="w-36">
						{actionFilter === 'all' ? 'Все действия' : actionFilter}
					</Select.Trigger>
					<Select.Content>
						{#each ACTION_OPTIONS as opt}
							<Select.Item value={opt} label={opt === 'all' ? 'Все действия' : opt}>
								{opt === 'all' ? 'Все действия' : opt}
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>

				<Select.Root
					type="single"
					value={sourceFilter}
					onValueChange={(v) => v && updateParam('source_service', v)}
				>
					<Select.Trigger class="w-40">
						{sourceFilter === 'all' ? 'Все источники' : sourceFilter}
					</Select.Trigger>
					<Select.Content>
						{#each SOURCE_OPTIONS as opt}
							<Select.Item value={opt} label={opt === 'all' ? 'Все источники' : opt}>
								{opt === 'all' ? 'Все источники' : opt}
							</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>

				<Select.Root
					type="single"
					value={successFilter}
					onValueChange={(v) => v && updateParam('success', v === 'all' ? null : v)}
				>
					<Select.Trigger class="w-32">
						{successFilter === 'all'
							? 'Все'
							: successFilter === 'true'
								? 'Успешные'
								: 'Ошибки'}
					</Select.Trigger>
					<Select.Content>
						<Select.Item value="all" label="Все">Все</Select.Item>
						<Select.Item value="true" label="Успешные">Успешные</Select.Item>
						<Select.Item value="false" label="Ошибки">Ошибки</Select.Item>
					</Select.Content>
				</Select.Root>

				{#if hasFilters}
					<Button variant="ghost" size="sm" onclick={clearFilters} class="gap-1.5">
						<X class="h-3.5 w-3.5" /> Сбросить
					</Button>
				{/if}
			</div>
		</CardContent>
	</Card>

	<!-- Таблица -->
	<Card>
		<CardContent class="p-0">
			{#if items.length === 0}
				<div class="flex flex-col items-center justify-center py-16 text-center">
					<div class="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
						<ScrollText class="h-6 w-6 text-muted-foreground" />
					</div>
					<p class="text-sm font-medium">Нет записей</p>
					<p class="text-xs text-muted-foreground mt-1">
						{hasFilters ? 'Попробуйте изменить фильтры' : 'Пока ничего не происходило'}
					</p>
				</div>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-40">Время</Table.Head>
							<Table.Head class="w-24">Источник</Table.Head>
							<Table.Head class="w-48">Автор</Table.Head>
							<Table.Head class="w-28">Действие</Table.Head>
							<Table.Head class="w-36">Объект</Table.Head>
							<Table.Head>Детали</Table.Head>
							<Table.Head class="w-14 text-center">Статус</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each items as entry (entry.id)}
							<Table.Row class="cursor-pointer" onclick={() => (detailsEntry = entry)}>
								<Table.Cell class="text-xs text-muted-foreground whitespace-nowrap">
									{formatDateTime(entry.created_at)}
								</Table.Cell>
								<Table.Cell>
									<Badge
										variant="outline"
										class="font-mono text-[10px] {sourceColor(entry.source_service)}"
									>
										{entry.source_service}
									</Badge>
								</Table.Cell>
								<Table.Cell>
									<div class="flex items-center gap-2">
										<UserIcon class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
										<div class="min-w-0">
											<div class="text-sm font-medium truncate">
												{entry.actor_username ?? '—'}
											</div>
											<div class="font-mono text-[10px] text-muted-foreground">
												{entry.actor_id ?? '—'}
											</div>
										</div>
									</div>
								</Table.Cell>
								<Table.Cell>
									<Badge
										variant="outline"
										class="font-mono text-[10px] {actionColor(entry.action)}"
									>
										{entry.action}
									</Badge>
								</Table.Cell>
								<Table.Cell class="text-xs">
									{#if entry.entity_type}
										<div class="font-medium">{entry.entity_type}</div>
										<div class="font-mono text-[10px] text-muted-foreground truncate">
											{entry.entity_id ?? '—'}
										</div>
									{:else}
										<span class="text-muted-foreground">—</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-xs">
									{#if entry.details && Object.keys(entry.details).length > 0}
										<span
											class="font-mono text-[10px] text-muted-foreground truncate block max-w-md"
										>
											{JSON.stringify(entry.details).slice(0, 80)}...
										</span>
									{:else}
										<span class="text-muted-foreground">—</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-center">
									{#if entry.success}
										<CheckCircle2 class="h-4 w-4 text-emerald-500 inline" />
									{:else}
										<XCircle class="h-4 w-4 text-red-500 inline" />
									{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>

				{#if totalPages > 1}
					<div class="flex items-center justify-between px-6 py-4 border-t">
						<p class="text-xs text-muted-foreground">
							Записи {currentOffset + 1}–{Math.min(currentOffset + PAGE_SIZE, total)} из {total}
						</p>
						<div class="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={currentPage === 1}
								onclick={() => setPage(currentPage - 1)}
							>
								<ChevronLeft class="h-4 w-4" />
							</Button>
							<span class="text-xs text-muted-foreground">
								{currentPage} / {totalPages}
							</span>
							<Button
								variant="outline"
								size="sm"
								disabled={currentPage >= totalPages}
								onclick={() => setPage(currentPage + 1)}
							>
								<ChevronRight class="h-4 w-4" />
							</Button>
						</div>
					</div>
				{/if}
			{/if}
		</CardContent>
	</Card>
</div>

<!-- Диалог деталей -->
<Dialog.Root open={detailsEntry !== null} onOpenChange={(v) => !v && (detailsEntry = null)}>
	<Dialog.Content class="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>Запись #{detailsEntry?.id}</Dialog.Title>
			<Dialog.Description>
				{formatDateTime(detailsEntry?.created_at)}
			</Dialog.Description>
		</Dialog.Header>

		{#if detailsEntry}
			<div class="space-y-4 py-2 text-sm">
				<div class="grid grid-cols-2 gap-4">
					<div>
						<div class="text-xs text-muted-foreground mb-1">Автор</div>
						<div class="font-medium">{detailsEntry.actor_username ?? '—'}</div>
						<div class="font-mono text-xs text-muted-foreground">
							{detailsEntry.actor_id ?? '—'}
						</div>
					</div>
					<div>
						<div class="text-xs text-muted-foreground mb-1">Источник / тип</div>
						<Badge
							variant="outline"
							class="font-mono text-xs {sourceColor(detailsEntry.source_service)}"
						>
							{detailsEntry.source_service}
						</Badge>
						<div class="font-mono text-xs text-muted-foreground mt-1">
							{detailsEntry.actor_type}
						</div>
					</div>
					<div>
						<div class="text-xs text-muted-foreground mb-1">Действие</div>
						<Badge
							variant="outline"
							class="font-mono text-xs {actionColor(detailsEntry.action)}"
						>
							{detailsEntry.action}
						</Badge>
					</div>
					<div>
						<div class="text-xs text-muted-foreground mb-1">Объект</div>
						<div class="font-medium">{detailsEntry.entity_type ?? '—'}</div>
						<div class="font-mono text-xs text-muted-foreground">
							{detailsEntry.entity_id ?? '—'}
						</div>
					</div>
					{#if detailsEntry.ip}
						<div class="col-span-2">
							<div class="text-xs text-muted-foreground mb-1 flex items-center gap-1">
								<Globe class="h-3 w-3" /> IP
							</div>
							<div class="font-mono text-xs">{detailsEntry.ip}</div>
						</div>
					{/if}
					{#if detailsEntry.received_at}
						<div class="col-span-2">
							<div class="text-xs text-muted-foreground mb-1">
								Получено сервисом
							</div>
							<div class="font-mono text-xs">
								{formatDateTime(detailsEntry.received_at)}
							</div>
						</div>
					{/if}
				</div>

				{#if detailsEntry.error}
					<div
						class="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
					>
						<div class="font-medium mb-1">Ошибка</div>
						<div class="font-mono break-all">{detailsEntry.error}</div>
					</div>
				{/if}

				{#if detailsEntry.details && Object.keys(detailsEntry.details).length > 0}
					<div>
						<div class="text-xs text-muted-foreground mb-1">Детали</div>
						<pre
							class="rounded-md bg-muted p-3 text-xs overflow-x-auto">{JSON.stringify(
								detailsEntry.details,
								null,
								2
							)}</pre>
					</div>
				{/if}
			</div>
		{/if}

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (detailsEntry = null)}>Закрыть</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>