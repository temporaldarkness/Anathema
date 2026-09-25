<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { invalidateAll } from '$app/navigation';
	import { notify } from '$lib/utils/toast';
	import { Brain, Plus, Trash2, Search } from 'lucide-svelte';

	let { data } = $props();

	let search = $state('');
	let currentPage = $state(1);
	const pageSize = 20;

	let addDialogOpen = $state(false);
	let newFact = $state('');
	let submitting = $state(false);

	let deleteTargetId = $state<number | null>(null);
	let deleting = $state(false);
	let refreshing = $state(false);

	const filtered = $derived(
		(data.items ?? []).filter((x: any) =>
			x.fact.toLowerCase().includes(search.toLowerCase())
		)
	);
	const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / pageSize)));
	const paged = $derived(filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize));

	$effect(() => {
		if (currentPage > totalPages) currentPage = totalPages;
	});

	async function reload() {
		refreshing = true;
		try {
			await invalidateAll();
		} finally {
			refreshing = false;
		}
	}

	async function addFact() {
		if (!newFact.trim()) return;
		submitting = true;
		try {
			const resp = await fetch('/api/ltm', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fact: newFact.trim() })
			});
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Факт добавлен');
			addDialogOpen = false;
			newFact = '';
			await reload();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось добавить факт');
		} finally {
			submitting = false;
		}
	}

	async function deleteFact(id: number) {
		deleting = true;
		try {
			const resp = await fetch(`/api/ltm/${id}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Факт удалён');
			await reload();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось удалить');
		} finally {
			deleting = false;
			deleteTargetId = null;
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Память бота (LTM)</h1>
			<p class="text-sm text-muted-foreground">
				Факты, которые бот запоминает в долгосрочной памяти
			</p>
		</div>
		<Button onclick={() => (addDialogOpen = true)} class="gap-2">
			<Plus class="h-4 w-4" />
			Добавить факт
		</Button>
	</div>

	<Card>
		<CardHeader class="flex flex-row items-center justify-between space-y-0">
			<CardTitle class="text-base">
				{#if refreshing}
					<Skeleton class="h-4 w-20" />
				{:else}
					Всего: {filtered.length}
				{/if}
			</CardTitle>
			<div class="relative w-72">
				<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input placeholder="Поиск по тексту..." bind:value={search} class="pl-9" />
			</div>
		</CardHeader>

		<CardContent>
			{#if refreshing}
				<!-- Скелетон -->
				<div class="space-y-3">
					{#each Array(5) as _}
						<div class="flex items-center gap-4">
							<Skeleton class="h-4 w-12" />
							<Skeleton class="h-4 flex-1" />
							<Skeleton class="h-4 w-40" />
							<Skeleton class="h-8 w-8 rounded-md" />
						</div>
					{/each}
				</div>
			{:else if paged.length === 0}
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<div class="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
						<Brain class="h-6 w-6 text-muted-foreground" />
					</div>
					<p class="text-sm font-medium">
						{search ? 'Ничего не найдено' : 'Память пуста'}
					</p>
					<p class="text-xs text-muted-foreground mt-1">
						{search ? 'Попробуйте другой запрос' : 'Добавьте первый факт кнопкой выше'}
					</p>
				</div>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-16">ID</Table.Head>
							<Table.Head>Факт</Table.Head>
							<Table.Head class="w-48">Создано</Table.Head>
							<Table.Head class="w-24 text-right">Действия</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each paged as item (item.id)}
							<Table.Row>
								<Table.Cell class="font-mono text-xs text-muted-foreground">
									{item.id}
								</Table.Cell>
								<Table.Cell class="max-w-0 truncate" title={item.fact}>
									{item.fact}
								</Table.Cell>
								<Table.Cell class="text-xs text-muted-foreground">
									{new Date(item.created_at).toLocaleString('ru-RU')}
								</Table.Cell>
								<Table.Cell class="text-right">
									<Button
										variant="ghost"
										size="icon"
										onclick={() => (deleteTargetId = item.id)}
										disabled={deleting}
									>
										<Trash2 class="h-4 w-4 text-destructive" />
									</Button>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>

				{#if totalPages > 1}
					<div class="mt-4 flex items-center justify-between">
						<p class="text-xs text-muted-foreground">
							Страница {currentPage} из {totalPages}
						</p>
						<div class="flex gap-2">
							<Button
								variant="outline"
								size="sm"
								disabled={currentPage === 1}
								onclick={() => (currentPage--)}
							>
								Назад
							</Button>
							<Button
								variant="outline"
								size="sm"
								disabled={currentPage === totalPages}
								onclick={() => (currentPage++)}
							>
								Вперёд
							</Button>
						</div>
					</div>
				{/if}
			{/if}
		</CardContent>
	</Card>
</div>

<Dialog.Root bind:open={addDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Добавить факт</Dialog.Title>
			<Dialog.Description>
				Факт попадёт в долгосрочную память бота и будет использоваться в диалогах.
			</Dialog.Description>
		</Dialog.Header>
		<div class="py-2">
			<Input
				bind:value={newFact}
				placeholder="Например: Пользователь X предпочитает тёмную тему"
				onkeydown={(e) => e.key === 'Enter' && addFact()}
			/>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (addDialogOpen = false)}>Отмена</Button>
			<Button onclick={addFact} disabled={submitting || !newFact.trim()}>
				{submitting ? 'Сохранение...' : 'Сохранить'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root open={deleteTargetId !== null} onOpenChange={(v) => !v && (deleteTargetId = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Удалить факт?</AlertDialog.Title>
			<AlertDialog.Description>Это действие нельзя отменить.</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<Button variant="outline" onclick={() => (deleteTargetId = null)}>Отмена</Button>
			<Button
				variant="destructive"
				onclick={() => deleteTargetId !== null && deleteFact(deleteTargetId)}
				disabled={deleting}
			>
				{deleting ? 'Удаление...' : 'Удалить'}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>