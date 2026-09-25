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
	import { parseEmote, emoteDisplayCode } from '$lib/utils/discord_emote';
	import EmotePreview from '$lib/components/ui/emotepreview';
	import { Smile, Plus, Trash2, Pencil, Search, Info, Wand2 } from 'lucide-svelte';

	let { data } = $props();

	let search = $state('');
	let refreshing = $state(false);

	let dialogOpen = $state(false);
	let editing = $state<any>(null);
	let form = $state({
		uid: '',
		source: '',
		human_code: '',
		description: ''
	});
	let rawInput = $state(''); // куда вставляют <:name:id> или глиф
	let submitting = $state(false);

	let deleteTargetUid = $state<string | null>(null);
	let deleting = $state(false);

	// Парсим то, что ввели
	const parsed = $derived(parseEmote(rawInput));

	const filtered = $derived(
		(data.emotes ?? []).filter((e: any) => {
			const q = search.toLowerCase();
			return (
				e.uid.toLowerCase().includes(q) ||
				(e.human_code ?? '').toLowerCase().includes(q) ||
				(e.description ?? '').toLowerCase().includes(q) ||
				String(e.source).includes(q)
			);
		})
	);

	const customCount = $derived(
		(data.emotes ?? []).filter((e: any) => /^\d{15,}$/.test(e.source)).length
	);

	function openCreate() {
		editing = null;
		form = { uid: '', source: '', human_code: '', description: '' };
		rawInput = '';
		dialogOpen = true;
	}

	function openEdit(e: any) {
		editing = e;
		form = {
			uid: e.uid,
			source: e.source,
			human_code: e.human_code ?? '',
			description: e.description ?? ''
		};
		// Восстановим «сырое» представление — если кастом, покажем <:name:id>
		rawInput = /^\d{15,}$/.test(e.source) ? `<:emote:${e.source}>` : e.source;
		dialogOpen = true;
	}

	/**
	 * Когда пользователь вводит/вставляет в поле "rawInput",
	 * автоматически заполняем source, uid (если пусто), human_code.
	 */
	function applyParsed() {
		if (!parsed) return;
		form.source = parsed.source;
		if (parsed.kind === 'custom') {
			if (!form.uid) form.uid = parsed.name.toLowerCase();
			if (!form.human_code) form.human_code = `:${parsed.name}:`;
		} else if (parsed.kind === 'unicode') {
			if (!form.human_code) form.human_code = parsed.source;
		}
	}

	async function reload() {
		refreshing = true;
		try {
			await invalidateAll();
		} finally {
			refreshing = false;
		}
	}

	async function submitForm() {
		applyParsed(); // на случай, если пользователь не нажал кнопку
		if (!form.uid.trim() || !form.source.trim()) {
			notify.error('Заполните UID и source (вставьте эмодзи)');
			return;
		}
		submitting = true;
		try {
			const payload = {
				uid: form.uid.trim(),
				source: form.source.trim(),
				human_code: form.human_code.trim() || null,
				description: form.description.trim() || null
			};
			const resp = await fetch('/api/emotes', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (!resp.ok) throw new Error(await resp.text());
			notify.success(editing ? 'Эмодзи обновлён' : 'Эмодзи добавлен');
			dialogOpen = false;
			await reload();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось сохранить');
		} finally {
			submitting = false;
		}
	}

	async function deleteEmote(uid: string) {
		deleting = true;
		try {
			const resp = await fetch(`/api/emotes/${uid}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Эмодзи удалён');
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
			<h1 class="text-2xl font-bold tracking-tight">Эмодзи</h1>
			<p class="text-sm text-muted-foreground">
				Кастомные и стандартные эмодзи, используемые ботом
			</p>
		</div>
		<Button onclick={openCreate} class="gap-2">
			<Plus class="h-4 w-4" />
			Добавить эмодзи
		</Button>
	</div>

	<div class="grid gap-4 sm:grid-cols-3">
		<Card>
			<CardHeader class="pb-2">
				<CardTitle class="text-xs font-medium text-muted-foreground">Всего</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-2xl font-bold">{data.emotes?.length ?? 0}</div>
			</CardContent>
		</Card>
		<Card>
			<CardHeader class="pb-2">
				<CardTitle class="text-xs font-medium text-muted-foreground">Кастомных</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="text-2xl font-bold text-violet-400">{customCount}</div>
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
			<CardTitle class="text-base">Список эмодзи</CardTitle>
			<div class="relative w-72">
				<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input placeholder="Поиск по uid, коду, описанию..." bind:value={search} class="pl-9" />
			</div>
		</CardHeader>

		<CardContent>
			{#if refreshing}
				<div class="space-y-3">
					{#each Array(5) as _}
						<div class="flex items-center gap-4">
							<Skeleton class="h-8 w-8 rounded" />
							<Skeleton class="h-4 w-24" />
							<Skeleton class="h-4 w-32" />
							<Skeleton class="h-4 flex-1" />
						</div>
					{/each}
				</div>
			{:else if filtered.length === 0}
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<div class="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
						<Smile class="h-6 w-6 text-muted-foreground" />
					</div>
					<p class="text-sm font-medium">
						{search ? 'Ничего не найдено' : 'Эмодзи нет'}
					</p>
					<p class="text-xs text-muted-foreground mt-1">
						{search ? 'Попробуйте другой запрос' : 'Добавьте первый эмодзи'}
					</p>
				</div>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-16">Превью</Table.Head>
							<Table.Head class="w-40">UID</Table.Head>
							<Table.Head class="w-40">Код</Table.Head>
							<Table.Head class="w-56">Source</Table.Head>
							<Table.Head>Описание</Table.Head>
							<Table.Head class="w-24 text-right">Действия</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each filtered as e (e.uid)}
							<Table.Row>
								<Table.Cell>
									<div class="flex h-8 w-8 items-center justify-center">
										<EmotePreview source={e.source} size={28} title={e.uid} />
									</div>
								</Table.Cell>
								<Table.Cell class="font-mono text-xs">
									<span class="truncate" title={e.uid}>{e.uid}</span>
								</Table.Cell>
								<Table.Cell>
									{#if e.human_code}
										<Badge variant="secondary" class="font-mono text-xs font-normal">
											{e.human_code}
										</Badge>
									{:else}
										<span class="text-xs text-muted-foreground">—</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="font-mono text-xs text-muted-foreground">
									<span class="truncate" title={e.source}>
										{emoteDisplayCode(e.source, e.uid)}
									</span>
								</Table.Cell>
								<Table.Cell class="text-sm">
									{#if e.description}
										{e.description}
									{:else}
										<span class="text-muted-foreground">—</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right">
									<div class="flex justify-end gap-1">
										<Button variant="ghost" size="icon" onclick={() => openEdit(e)}>
											<Pencil class="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											onclick={() => (deleteTargetUid = e.uid)}
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

<!-- Диалог -->
<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Content class="sm:max-w-xl max-h-[90vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>{editing ? 'Редактировать эмодзи' : 'Новый эмодзи'}</Dialog.Title>
			<Dialog.Description>
				{editing ? `UID: ${editing.uid}` : 'Вставьте кастомный эмодзи или введите Unicode-глиф'}
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-2">
			<!-- Основное поле ввода -->
			<div class="space-y-1.5">
				<label for="e-raw" class="text-xs font-medium">
					Вставьте эмодзи или код *
				</label>
				<Input
					id="e-raw"
					bind:value={rawInput}
					placeholder="<:kumar:1320752851349147729>, <a:party:111...>, или 👍"
					class="font-mono text-sm"
					oninput={applyParsed}
				/>
				<p class="text-[10px] text-muted-foreground">
					Скопируйте эмодзи из Discord: правой кнопкой → «Copy Emoji Link», вставьте сюда.
					Поддерживаются Unicode-глифы и формат <code>&lt;:name:id&gt;</code>.
				</p>
			</div>

			<!-- Превью парсинга -->
			{#if parsed}
				<div
					class="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3"
				>
					<div class="flex h-10 w-10 items-center justify-center rounded-md bg-background">
						<EmotePreview source={parsed.source} size={32} />
					</div>
					<div class="flex-1 space-y-0.5 text-xs">
						<div class="flex items-center gap-2">
							<Badge variant="outline" class="text-[10px]">
								{parsed.kind === 'custom' ? (parsed.animated ? 'animated' : 'custom') : 'unicode'}
							</Badge>
							<span class="font-mono text-muted-foreground">source: {parsed.source}</span>
						</div>
						{#if parsed.kind === 'custom'}
							<p class="text-muted-foreground">
								В сообщениях бот будет вставлять:
								<code class="rounded bg-muted px-1">{emoteDisplayCode(parsed.source, parsed.name, parsed.animated)}</code>
							</p>
						{/if}
					</div>
				</div>
			{:else if rawInput.trim()}
				<div
					class="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"
				>
					<Info class="h-4 w-4 shrink-0" />
					Не удалось распознать. Вставьте либо Unicode-глиф, либо <code>&lt;:name:id&gt;</code>.
				</div>
			{/if}

			<!-- UID -->
			<div class="space-y-1.5">
				<label for="e-uid" class="text-xs font-medium">UID *</label>
				<Input
					id="e-uid"
					bind:value={form.uid}
					placeholder="kumar"
					disabled={!!editing}
					class="font-mono text-xs"
				/>
				<p class="text-[10px] text-muted-foreground">
					Внутреннее имя. Для кастомных — обычно совпадает с именем эмодзи в Discord.
				</p>
			</div>

			<!-- Source (для ручной правки) -->
			<div class="space-y-1.5">
				<label for="e-source" class="text-xs font-medium">Source</label>
				<Input
					id="e-source"
					bind:value={form.source}
					placeholder="👍 или 1320752851349147729"
					class="font-mono text-xs"
				/>
				<p class="text-[10px] text-muted-foreground">
					Заполняется автоматически из поля выше. Для кастомных — ID без угловых скобок.
				</p>
			</div>

			<!-- Human code -->
			<div class="space-y-1.5">
				<label for="e-code" class="text-xs font-medium">Человеческий код</label>
				<Input
					id="e-code"
					bind:value={form.human_code}
					placeholder=":kumar: или 💸"
					class="font-mono text-xs"
				/>
				<p class="text-[10px] text-muted-foreground">
					Как эмодзи называют пользователи сервера. Используется в промпте.
				</p>
			</div>

			<!-- Description -->
			<div class="space-y-1.5">
				<label for="e-desc" class="text-xs font-medium">Описание</label>
				<Textarea
					id="e-desc"
					bind:value={form.description}
					placeholder="Кумар — мемный персонаж сервера, используется для одобрения."
					rows={3}
					class="text-sm resize-y"
				/>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (dialogOpen = false)}>Отмена</Button>
			<Button onclick={submitForm} disabled={submitting || !parsed}>
				{submitting ? 'Сохранение...' : 'Сохранить'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Подтверждение удаления -->
<AlertDialog.Root open={deleteTargetUid !== null} onOpenChange={(v) => !v && (deleteTargetUid = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Удалить эмодзи?</AlertDialog.Title>
			<AlertDialog.Description>
				Эмодзи <span class="font-mono">{deleteTargetUid}</span> будет удалён.
				Связанные реакции и ключевые слова тоже пострадают (CASCADE).
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<Button variant="outline" onclick={() => (deleteTargetUid = null)}>Отмена</Button>
			<Button
				variant="destructive"
				onclick={() => deleteTargetUid && deleteEmote(deleteTargetUid)}
				disabled={deleting}
			>
				{deleting ? 'Удаление...' : 'Удалить'}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>