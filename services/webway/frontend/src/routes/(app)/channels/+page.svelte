<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { invalidateAll } from '$app/navigation';
	import { notify } from '$lib/utils/toast';
	import { extractError } from '$lib/utils/api';
	import { Hash, Plus, Trash2, Pencil, Search, Download, MessageSquare, Info } from 'lucide-svelte';

	let { data } = $props();

	let search = $state('');
	let refreshing = $state(false);

	let dialogOpen = $state(false);
	let editing = $state<any>(null);
	let form = $state({
		uid: '',
		channel_id: '',
		human_name: '',
		human_topic: '',
		prompt: ''
	});
	let submitting = $state(false);
	let fetchingDiscord = $state(false);
	let discordPreview = $state<{ name: string; topic: string | null; type: number } | null>(null);

	let deleteTargetUid = $state<string | null>(null);
	let deleting = $state(false);

	const PROMPT_MAX = 2000;

	const filtered = $derived(
		(data.channels ?? []).filter((c: any) => {
			const q = search.toLowerCase();
			return (
				c.uid.toLowerCase().includes(q) ||
				String(c.channel_id).includes(q) ||
				(c.human_name ?? '').toLowerCase().includes(q) ||
				(c.human_topic ?? '').toLowerCase().includes(q) ||
				(c.prompt ?? '').toLowerCase().includes(q)
			);
		})
	);

	const hasPrompt = $derived((data.channels ?? []).filter((c: any) => c.prompt?.trim()).length);

	function openCreate() {
		editing = null;
		form = {
			uid: '',
			channel_id: '',
			human_name: '',
			human_topic: '',
			prompt: ''
		};
		discordPreview = null;
		dialogOpen = true;
	}

	function openEdit(c: any) {
		editing = c;
		form = {
			uid: c.uid,
			channel_id: String(c.channel_id),
			human_name: c.human_name ?? '',
			human_topic: c.human_topic ?? '',
			prompt: c.prompt ?? ''
		};
		discordPreview = null;
		dialogOpen = true;
	}

	async function reload() {
		refreshing = true;
		try {
			await invalidateAll();
		} finally {
			refreshing = false;
		}
	}

	/**
	 * Парсит введённое значение как ID канала.
	 * Принимает: "123456789", "<#123456789>", URL discord.com/channels/guild/channel
	 */
	function parseChannelId(raw: string): string {
		const trimmed = raw.trim();
		// <#123456789>
		const mention = trimmed.match(/^<#(\d+)>$/);
		if (mention) return mention[1];
		// URL: https://discord.com/channels/123/456
		const url = trimmed.match(/discord\.com\/channels\/\d+\/(\d+)/);
		if (url) return url[1];
		// Просто цифры
		if (/^\d+$/.test(trimmed)) return trimmed;
		return trimmed;
	}

	async function fetchDiscordChannel() {
		const clean = parseChannelId(form.channel_id);
		if (!/^\d+$/.test(clean)) {
			notify.error('Введите ID канала или вставьте ссылку/упоминание');
			return;
		}
		form.channel_id = clean;
		fetchingDiscord = true;
		try {
			const resp = await fetch(`/api/discord/channel/${clean}`);
			if (resp.status === 404) {
				notify.error('Канал не найден в Discord');
				return;
			}
			if (!resp.ok) throw new Error(await extractError(resp));
			const c = await resp.json();
			discordPreview = { name: c.name, topic: c.topic, type: c.type };
			if (!form.human_name) form.human_name = c.name;
			if (!form.human_topic && c.topic) form.human_topic = c.topic;
			notify.success(`Подтянуто: #${c.name}`);
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось загрузить канал');
		} finally {
			fetchingDiscord = false;
		}
	}

	async function submitForm() {
		if (!form.uid.trim() || !form.channel_id.trim()) {
			notify.error('UID и Discord ID обязательны');
			return;
		}
		if (form.prompt.length > PROMPT_MAX) {
			notify.error(`Prompt длиннее ${PROMPT_MAX} символов`);
			return;
		}
		submitting = true;
		try {
			const payload = {
				uid: form.uid.trim(),
				channel_id: form.channel_id.trim(),
				human_name: form.human_name.trim() || null,
				human_topic: form.human_topic.trim() || null,
				prompt: form.prompt.trim() || null
			};
			const resp = await fetch('/api/channels', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!resp.ok) throw new Error(await resp.text());
			notify.success(editing ? 'Канал обновлён' : 'Канал создан');
			dialogOpen = false;
			await reload();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось сохранить');
		} finally {
			submitting = false;
		}
	}

	async function deleteChannel(uid: string) {
		deleting = true;
		try {
			const resp = await fetch(`/api/channels/${uid}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Канал удалён');
			await reload();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось удалить');
		} finally {
			deleting = false;
			deleteTargetUid = null;
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Каналы</h1>
			<p class="text-sm text-muted-foreground">
				Настройка каналов и инструкций для AI
			</p>
		</div>
		<Button onclick={openCreate} class="gap-2">
			<Plus class="h-4 w-4" />
			Добавить канал
		</Button>
	</div>

	<!-- Мини-статистика -->
	<div class="grid gap-4 sm:grid-cols-3">
		<Card>
			<CardHeader class="pb-2">
				<CardTitle class="text-xs font-medium text-muted-foreground">Всего каналов</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-2xl font-bold">{data.channels?.length ?? 0}</div>
			</CardContent>
		</Card>
		<Card>
			<CardHeader class="pb-2">
				<CardTitle class="text-xs font-medium text-muted-foreground">С инструкцией</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-2xl font-bold text-violet-400">{hasPrompt}</div>
			</CardContent>
		</Card>
		<Card>
			<CardHeader class="pb-2">
				<CardTitle class="text-xs font-medium text-muted-foreground">Найдено</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-2xl font-bold">{filtered.length}</div>
			</CardContent>
		</Card>
	</div>

	<Card>
		<CardHeader class="flex flex-row items-center justify-between space-y-0">
			<CardTitle class="text-base">Список каналов</CardTitle>
			<div class="relative w-72">
				<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input placeholder="Поиск по uid, имени, prompt..." bind:value={search} class="pl-9" />
			</div>
		</CardHeader>

		<CardContent>
			{#if refreshing}
				<div class="space-y-3">
					{#each Array(4) as _}
						<div class="flex items-center gap-4">
							<Skeleton class="h-4 w-32" />
							<Skeleton class="h-4 w-40" />
							<Skeleton class="h-4 flex-1" />
							<Skeleton class="h-8 w-16" />
						</div>
					{/each}
				</div>
			{:else if filtered.length === 0}
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<div class="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
						<Hash class="h-6 w-6 text-muted-foreground" />
					</div>
					<p class="text-sm font-medium">
						{search ? 'Ничего не найдено' : 'Каналов нет'}
					</p>
					<p class="text-xs text-muted-foreground mt-1">
						{search ? 'Попробуйте другой запрос' : 'Добавьте первый канал'}
					</p>
				</div>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-40">UID</Table.Head>
							<Table.Head class="w-44">Discord ID</Table.Head>
							<Table.Head>Имя / Описание</Table.Head>
							<Table.Head class="w-32 text-center">Prompt</Table.Head>
							<Table.Head class="w-24 text-right">Действия</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each filtered as c (c.uid)}
							<Table.Row>
								<Table.Cell class="font-mono text-xs">
									<span class="truncate" title={c.uid}>{c.uid}</span>
								</Table.Cell>
								<Table.Cell class="font-mono text-xs text-muted-foreground">
									{c.channel_id}
								</Table.Cell>
								<Table.Cell>
									<div class="space-y-0.5">
										<div class="font-medium text-sm">
											{#if c.human_name}
												{c.human_name}
											{:else}
												<span class="text-muted-foreground">—</span>
											{/if}
										</div>
										{#if c.human_topic}
											<div class="text-xs text-muted-foreground line-clamp-1">
												{c.human_topic}
											</div>
										{/if}
									</div>
								</Table.Cell>
								<Table.Cell class="text-center">
									{#if c.prompt?.trim()}
										<Badge
											variant="secondary"
											class="gap-1 bg-violet-500/15 text-violet-400 hover:bg-violet-500/20 border-violet-500/20"
										>
											<MessageSquare class="h-3 w-3" />
											{c.prompt.length}
										</Badge>
									{:else}
										<span class="text-xs text-muted-foreground">—</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right">
									<div class="flex justify-end gap-1">
										<Button variant="ghost" size="icon" onclick={() => openEdit(c)}>
											<Pencil class="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											onclick={() => (deleteTargetUid = c.uid)}
											disabled={deleting}
										>
											<Trash2 class="h-4 w-4 text-destructive" />
										</Button>
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			{/if}
		</CardContent>
	</Card>
</div>

<!-- Диалог создания/редактирования -->
<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>{editing ? 'Редактировать канал' : 'Новый канал'}</Dialog.Title>
			<Dialog.Description>
				{editing ? `UID: ${editing.uid}` : 'Заполните обязательные поля'}
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-2">
			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-1.5">
					<label for="c-uid" class="text-xs font-medium">UID *</label>
					<Input
						id="c-uid"
						bind:value={form.uid}
						placeholder="general_chat"
						disabled={!!editing}
					/>
				</div>
				<div class="space-y-1.5">
					<label for="c-channel" class="text-xs font-medium">Discord ID *</label>
					<div class="flex gap-2">
						<Input
							id="c-channel"
							bind:value={form.channel_id}
							placeholder="123456789 или <#123> или URL"
							class="flex-1 font-mono text-xs"
						/>
						<Button
							type="button"
							variant="outline"
							onclick={fetchDiscordChannel}
							disabled={fetchingDiscord || !form.channel_id.trim()}
						>
							<Download class="h-4 w-4 mr-1" />
							{fetchingDiscord ? '...' : 'Из Discord'}
						</Button>
					</div>
				</div>
			</div>

			{#if discordPreview}
				<div
					class="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-xs"
				>
					<Info class="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
					<div class="space-y-0.5">
						<p class="font-medium text-blue-400">
							Из Discord: #{discordPreview.name}
						</p>
						{#if discordPreview.topic}
							<p class="text-muted-foreground">{discordPreview.topic}</p>
						{/if}
					</div>
				</div>
			{/if}

			<div class="space-y-1.5">
				<label for="c-name" class="text-xs font-medium">Имя (для AI)</label>
				<Input
					id="c-name"
					bind:value={form.human_name}
					placeholder="Общий чат"
				/>
			</div>

			<div class="space-y-1.5">
				<label for="c-topic" class="text-xs font-medium">Описание (для AI)</label>
				<Input
					id="c-topic"
					bind:value={form.human_topic}
					placeholder="Канал для свободного общения"
				/>
			</div>

			<div class="space-y-1.5">
				<div class="flex items-center justify-between">
					<label for="c-prompt" class="text-xs font-medium">
						Инструкция для AI
					</label>
					<span
						class="text-[10px] {form.prompt.length > PROMPT_MAX
							? 'text-destructive font-medium'
							: 'text-muted-foreground'}"
					>
						{form.prompt.length} / {PROMPT_MAX}
					</span>
				</div>
				<Textarea
					id="c-prompt"
					bind:value={form.prompt}
					placeholder="Например: Отвечай в стиле шекспировского сонета, используй архаичную лексику."
					rows={6}
					class="font-mono text-xs resize-y"
				/>
				<p class="text-[10px] text-muted-foreground">
					Эта инструкция применяется только в этом канале и <strong>имеет высший приоритет</strong> над остальными правилами бота.
				</p>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (dialogOpen = false)}>Отмена</Button>
			<Button onclick={submitForm} disabled={submitting}>
				{submitting ? 'Сохранение...' : 'Сохранить'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Подтверждение удаления -->
<AlertDialog.Root open={deleteTargetUid !== null} onOpenChange={(v) => !v && (deleteTargetUid = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Удалить канал?</AlertDialog.Title>
			<AlertDialog.Description>
				Запись <span class="font-mono">{deleteTargetUid}</span> будет удалена. Бот перестанет
				применять инструкцию для этого канала.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<Button variant="outline" onclick={() => (deleteTargetUid = null)}>Отмена</Button>
			<Button
				variant="destructive"
				onclick={() => deleteTargetUid && deleteChannel(deleteTargetUid)}
				disabled={deleting}
			>
				{deleting ? 'Удаление...' : 'Удалить'}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>