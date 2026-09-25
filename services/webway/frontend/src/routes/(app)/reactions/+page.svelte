<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Tabs from '$lib/components/ui/tabs';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { invalidateAll } from '$app/navigation';
	import { notify } from '$lib/utils/toast';
	import EmotePreview from '$lib/components/ui/emotepreview';
	import EmoteSelect from '$lib/components/ui/emoteselect';
	import UserSelect from '$lib/components/ui/userselect';
	import { Zap, Plus, Trash2, Search, Hash, User as UserIcon, Info } from 'lucide-svelte';

	let { data } = $props();

	let activeTab = $state<'keywords' | 'users'>('keywords');
	let refreshing = $state(false);

	let kwSearch = $state('');
	let urSearch = $state('');

	// --- Add dialogs ---
	let kwDialogOpen = $state(false);
	let urDialogOpen = $state(false);
	let submitting = $state(false);

	let kwForm = $state({ keyword: '', emoji_uid: null as string | null });
	let urForm = $state({ user_uid: null as string | null, emoji_uid: null as string | null });

	let deleteKwId = $state<number | null>(null);
	let deleteUrId = $state<number | null>(null);
	let deleting = $state(false);

	// --- Lookups ---
	const emotesByUid = $derived(
		Object.fromEntries((data.emotes ?? []).map((e: any) => [e.uid, e]))
	);
	const usersByUid = $derived(
		Object.fromEntries((data.users ?? []).map((u: any) => [u.uid, u]))
	);

	const filteredKeywords = $derived(
		(data.keywords ?? []).filter((k: any) => {
			const q = kwSearch.toLowerCase();
			return (
				k.keyword.toLowerCase().includes(q) ||
				(k.emoji_uid ?? '').toLowerCase().includes(q)
			);
		})
	);

	const filteredUserReactions = $derived(
		(data.userReactions ?? []).filter((r: any) => {
			const q = urSearch.toLowerCase();
			const user = usersByUid[r.user_uid];
			return (
				r.user_uid.toLowerCase().includes(q) ||
				(user?.username ?? '').toLowerCase().includes(q)
			);
		})
	);

	async function reload() {
		refreshing = true;
		try {
			await invalidateAll();
		} finally {
			refreshing = false;
		}
	}

	function openKwDialog() {
		kwForm = { keyword: '', emoji_uid: null };
		kwDialogOpen = true;
	}

	function openUrDialog() {
		urForm = { user_uid: null, emoji_uid: null };
		urDialogOpen = true;
	}

	async function submitKeyword() {
		if (!kwForm.keyword.trim() || !kwForm.emoji_uid) {
			notify.error('Заполните ключевое слово и выберите эмодзи');
			return;
		}
		submitting = true;
		try {
			const resp = await fetch('/api/keywords', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					keyword: kwForm.keyword.trim(),
					emoji_uid: kwForm.emoji_uid
				})
			});
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Ключевое слово добавлено');
			kwDialogOpen = false;
			await reload();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось сохранить');
		} finally {
			submitting = false;
		}
	}

	async function submitUserReaction() {
		if (!urForm.user_uid || !urForm.emoji_uid) {
			notify.error('Выберите пользователя и эмодзи');
			return;
		}
		submitting = true;
		try {
			const resp = await fetch('/api/user_reactions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					user_uid: urForm.user_uid,
					emoji_uid: urForm.emoji_uid
				})
			});
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Реакция добавлена');
			urDialogOpen = false;
			await reload();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось сохранить');
		} finally {
			submitting = false;
		}
	}

	async function deleteKeyword(id: number) {
		deleting = true;
		try {
			const resp = await fetch(`/api/keywords/${id}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Ключевое слово удалено');
			await reload();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось удалить');
		} finally {
			deleting = false;
			deleteKwId = null;
		}
	}

	async function deleteUserReaction(id: number) {
		deleting = true;
		try {
			const resp = await fetch(`/api/user_reactions/${id}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Реакция удалена');
			await reload();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось удалить');
		} finally {
			deleting = false;
			deleteUrId = null;
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Реакции</h1>
			<p class="text-sm text-muted-foreground">
				Автоматические реакции на сообщения по ключевым словам и пользователям
			</p>
		</div>
	</div>

	<!-- Мини-статистика -->
	<div class="grid gap-4 sm:grid-cols-3">
		<Card>
			<CardHeader class="pb-2">
				<CardTitle class="text-xs font-medium text-muted-foreground">
					Ключевых слов
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-2xl font-bold text-pink-400">{data.keywords?.length ?? 0}</div>
			</CardContent>
		</Card>
		<Card>
			<CardHeader class="pb-2">
				<CardTitle class="text-xs font-medium text-muted-foreground">
					Реакций пользователей
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-2xl font-bold text-cyan-400">
					{data.userReactions?.length ?? 0}
				</div>
			</CardContent>
		</Card>
		<Card>
			<CardHeader class="pb-2">
				<CardTitle class="text-xs font-medium text-muted-foreground">
					Задействовано эмодзи
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-2xl font-bold text-violet-400">
					{new Set([
						...(data.keywords ?? []).map((k: any) => k.emoji_uid),
						...(data.userReactions ?? []).map((r: any) => r.emoji_uid)
					]).size}
				</div>
			</CardContent>
		</Card>
	</div>

	<Tabs.Root bind:value={activeTab}>
		<Tabs.List>
			<Tabs.Trigger value="keywords" class="gap-2">
				<Hash class="h-4 w-4" /> По ключевым словам
			</Tabs.Trigger>
			<Tabs.Trigger value="users" class="gap-2">
				<UserIcon class="h-4 w-4" /> По пользователям
			</Tabs.Trigger>
		</Tabs.List>

		<!-- === Вкладка ключевых слов === -->
		<Tabs.Content value="keywords" class="space-y-4 mt-4">
			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0">
					<CardTitle class="text-base">
						{#if refreshing}
							<Skeleton class="h-4 w-20" />
						{:else}
							Всего: {filteredKeywords.length}
						{/if}
					</CardTitle>
					<div class="flex items-center gap-2">
						<div class="relative w-64">
							<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								placeholder="Поиск по слову..."
								bind:value={kwSearch}
								class="pl-9"
							/>
						</div>
						<Button onclick={openKwDialog} class="gap-2">
							<Plus class="h-4 w-4" /> Добавить
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{#if refreshing}
						<div class="space-y-3">
							{#each Array(4) as _}
								<div class="flex items-center gap-4">
									<Skeleton class="h-4 w-32" />
									<Skeleton class="h-8 w-8 rounded" />
									<Skeleton class="h-4 w-24" />
								</div>
							{/each}
						</div>
					{:else if filteredKeywords.length === 0}
						<div class="flex flex-col items-center justify-center py-12 text-center">
							<div class="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
								<Hash class="h-6 w-6 text-muted-foreground" />
							</div>
							<p class="text-sm font-medium">
								{kwSearch ? 'Ничего не найдено' : 'Ключевых слов нет'}
							</p>
							<p class="text-xs text-muted-foreground mt-1">
								{kwSearch ? 'Попробуйте другой запрос' : 'Добавьте первое слово'}
							</p>
						</div>
					{:else}
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head class="w-16">ID</Table.Head>
									<Table.Head>Ключевое слово</Table.Head>
									<Table.Head class="w-32 text-center">Эмодзи</Table.Head>
									<Table.Head class="w-24 text-right">Действия</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each filteredKeywords as k (k.id)}
									<Table.Row>
										<Table.Cell class="font-mono text-xs text-muted-foreground">
											{k.id}
										</Table.Cell>
										<Table.Cell>
											<Badge variant="secondary" class="font-mono text-xs font-normal">
												{k.keyword}
											</Badge>
										</Table.Cell>
										<Table.Cell class="text-center">
											<div class="flex justify-center">
												{#if emotesByUid[k.emoji_uid]}
													<div class="flex items-center gap-2">
														<EmotePreview
															source={emotesByUid[k.emoji_uid].source}
															size={24}
														/>
														<span class="font-mono text-xs text-muted-foreground">
															{emotesByUid[k.emoji_uid].uid}
														</span>
													</div>
												{:else}
													<span class="text-xs text-destructive">
														{k.emoji_uid} (удалён)
													</span>
												{/if}
											</div>
										</Table.Cell>
										<Table.Cell class="text-right">
											<Button
												variant="ghost"
												size="icon"
												onclick={() => (deleteKwId = k.id)}
												disabled={deleting}
											>
												<Trash2 class="h-4 w-4 text-destructive" />
											</Button>
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					{/if}
				</CardContent>
			</Card>
		</Tabs.Content>

		<!-- === Вкладка пользователей === -->
		<Tabs.Content value="users" class="space-y-4 mt-4">
			<Card>
				<CardHeader class="flex flex-row items-center justify-between space-y-0">
					<CardTitle class="text-base">
						{#if refreshing}
							<Skeleton class="h-4 w-20" />
						{:else}
							Всего: {filteredUserReactions.length}
						{/if}
					</CardTitle>
					<div class="flex items-center gap-2">
						<div class="relative w-64">
							<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								placeholder="Поиск по пользователю..."
								bind:value={urSearch}
								class="pl-9"
							/>
						</div>
						<Button onclick={openUrDialog} class="gap-2">
							<Plus class="h-4 w-4" /> Добавить
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					{#if refreshing}
						<div class="space-y-3">
							{#each Array(4) as _}
								<div class="flex items-center gap-4">
									<Skeleton class="h-4 w-32" />
									<Skeleton class="h-8 w-8 rounded" />
									<Skeleton class="h-4 w-24" />
								</div>
							{/each}
						</div>
					{:else if filteredUserReactions.length === 0}
						<div class="flex flex-col items-center justify-center py-12 text-center">
							<div class="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
								<UserIcon class="h-6 w-6 text-muted-foreground" />
							</div>
							<p class="text-sm font-medium">
								{urSearch ? 'Ничего не найдено' : 'Реакций пользователей нет'}
							</p>
							<p class="text-xs text-muted-foreground mt-1">
								{urSearch ? 'Попробуйте другой запрос' : 'Добавьте первую реакцию'}
							</p>
						</div>
					{:else}
						<Table.Root>
							<Table.Header>
								<Table.Row>
									<Table.Head class="w-16">ID</Table.Head>
									<Table.Head>Пользователь</Table.Head>
									<Table.Head class="w-40 text-center">Эмодзи</Table.Head>
									<Table.Head class="w-24 text-right">Действия</Table.Head>
								</Table.Row>
							</Table.Header>
							<Table.Body>
								{#each filteredUserReactions as r (r.id)}
									<Table.Row>
										<Table.Cell class="font-mono text-xs text-muted-foreground">
											{r.id}
										</Table.Cell>
										<Table.Cell>
											{#if usersByUid[r.user_uid]}
												<div class="flex items-center gap-2">
													<span class="text-sm font-medium">
														{usersByUid[r.user_uid].username}
													</span>
													<span class="font-mono text-[10px] text-muted-foreground">
														{r.user_uid}
													</span>
												</div>
											{:else}
												<span class="text-xs text-destructive">
													{r.user_uid} (удалён)
												</span>
											{/if}
										</Table.Cell>
										<Table.Cell class="text-center">
											<div class="flex justify-center">
												{#if emotesByUid[r.emoji_uid]}
													<div class="flex items-center gap-2">
														<EmotePreview
															source={emotesByUid[r.emoji_uid].source}
															size={24}
														/>
														<span class="font-mono text-xs text-muted-foreground">
															{emotesByUid[r.emoji_uid].uid}
														</span>
													</div>
												{:else}
													<span class="text-xs text-destructive">
														{r.emoji_uid} (удалён)
													</span>
												{/if}
											</div>
										</Table.Cell>
										<Table.Cell class="text-right">
											<Button
												variant="ghost"
												size="icon"
												onclick={() => (deleteUrId = r.id)}
												disabled={deleting}
											>
												<Trash2 class="h-4 w-4 text-destructive" />
											</Button>
										</Table.Cell>
									</Table.Row>
								{/each}
							</Table.Body>
						</Table.Root>
					{/if}
				</CardContent>
			</Card>
		</Tabs.Content>
	</Tabs.Root>
</div>

<!-- Диалог: ключевое слово -->
<Dialog.Root bind:open={kwDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Новое ключевое слово</Dialog.Title>
			<Dialog.Description>
				Когда в сообщении встретится это слово, бот поставит выбранную реакцию.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-2">
			<div class="space-y-1.5">
				<label class="text-xs font-medium">Ключевое слово *</label>
				<Input
					bind:value={kwForm.keyword}
					placeholder="привет"
					onkeydown={(e) => e.key === 'Enter' && submitKeyword()}
				/>
				<p class="text-[10px] text-muted-foreground">
					Проверка без учёта регистра, ищется как подстрока.
				</p>
			</div>

			<div class="space-y-1.5">
				<label class="text-xs font-medium">Эмодзи-реакция *</label>
				<EmoteSelect bind:value={kwForm.emoji_uid} emotes={data.emotes ?? []} />
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (kwDialogOpen = false)}>Отмена</Button>
			<Button onclick={submitKeyword} disabled={submitting || !kwForm.emoji_uid}>
				{submitting ? 'Сохранение...' : 'Добавить'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Диалог: реакция пользователя -->
<Dialog.Root bind:open={urDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Новая реакция на пользователя</Dialog.Title>
			<Dialog.Description>
				Бот поставит выбранную реакцию на все сообщения этого пользователя.
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-2">
			<div class="space-y-1.5">
				<label class="text-xs font-medium">Пользователь *</label>
				<UserSelect bind:value={urForm.user_uid} users={data.users ?? []} />
			</div>

			<div class="space-y-1.5">
				<label class="text-xs font-medium">Эмодзи-реакция *</label>
				<EmoteSelect bind:value={urForm.emoji_uid} emotes={data.emotes ?? []} />
			</div>

			<div class="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 p-2.5 text-[11px]">
				<Info class="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
				<p class="text-muted-foreground">
					В старой логике бот снимал предыдущую реакцию с сообщения пользователя и ставил новую.
					Если у пользователя несколько записей — сработают все.
				</p>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (urDialogOpen = false)}>Отмена</Button>
			<Button
				onclick={submitUserReaction}
				disabled={submitting || !urForm.user_uid || !urForm.emoji_uid}
			>
				{submitting ? 'Сохранение...' : 'Добавить'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Подтверждения -->
<AlertDialog.Root open={deleteKwId !== null} onOpenChange={(v) => !v && (deleteKwId = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Удалить ключевое слово?</AlertDialog.Title>
			<AlertDialog.Description>
				Бот перестанет реагировать на это слово.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<Button variant="outline" onclick={() => (deleteKwId = null)}>Отмена</Button>
			<Button
				variant="destructive"
				onclick={() => deleteKwId !== null && deleteKeyword(deleteKwId)}
				disabled={deleting}
			>
				{deleting ? 'Удаление...' : 'Удалить'}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root open={deleteUrId !== null} onOpenChange={(v) => !v && (deleteUrId = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Удалить реакцию?</AlertDialog.Title>
			<AlertDialog.Description>
				Бот перестанет реагировать на сообщения этого пользователя.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<Button variant="outline" onclick={() => (deleteUrId = null)}>Отмена</Button>
			<Button
				variant="destructive"
				onclick={() => deleteUrId !== null && deleteUserReaction(deleteUrId)}
				disabled={deleting}
			>
				{deleting ? 'Удаление...' : 'Удалить'}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>