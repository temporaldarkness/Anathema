<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { invalidateAll } from '$app/navigation';
	import { notify } from '$lib/utils/toast';
	import { formatDateTime, formatBytes } from '$lib/utils/format';
	import {
		ArrowLeft, Upload, Trash2, Pencil, Search, Music, FileAudio,
		Loader2, Clock, RefreshCw, ListPlus, ListX, X, PlayCircle
	} from 'lucide-svelte';

	let { data } = $props();

	let search = $state('');
	let uploading = $state(false);
	let uploadProgress = $state(0);
	let normalizing = $state(false);

	// Очередь
	let queue = $state<any[]>(data.queue?.items ?? []);
	let queueingId = $state<number | null>(null);
	const queuedIds = $derived(new Set(queue.map((q: any) => q.song_id)));

	async function refreshQueue() {
		try {
			const r = await fetch('/api/radio/queue');
			if (r.ok) {
				const body = await r.json();
				queue = body.items ?? [];
			}
		} catch {}
	}

	async function addToQueue(song: any) {
		if (queuedIds.has(song.id)) return;
		queueingId = song.id;
		try {
			const resp = await fetch(`/api/radio/queue/${song.id}`, { method: 'POST' });
			if (!resp.ok) throw new Error(await resp.text());
			notify.success(`Следом: ${song.title}`);
			await refreshQueue();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось поставить');
		} finally {
			queueingId = null;
		}
	}

	async function removeFromQueue(songId: number) {
		try {
			const resp = await fetch(`/api/radio/queue/${songId}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error(await resp.text());
			await refreshQueue();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось убрать');
		}
	}

	async function clearQueue() {
		if (!confirm('Очистить очередь?')) return;
		try {
			const resp = await fetch('/api/radio/queue', { method: 'DELETE' });
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Очередь очищена');
			await refreshQueue();
		} catch (e: any) {
			notify.error(e.message ?? 'Ошибка');
		}
	}

	async function normalizeAll() {
		if (!confirm('Запустить перекодирование всех треков в фоне? Это может занять несколько минут.')) return;
		normalizing = true;
		try {
			const resp = await fetch('/api/radio/normalize-all', { method: 'POST' });
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Нормализация запущена в фоне. Смотри логи radio_service.');
		} catch (e: any) {
			notify.error(e.message ?? 'Ошибка');
		} finally {
			normalizing = false;
		}
	}

	let editing = $state<any>(null);
	let editDialogOpen = $state(false);
	let editForm = $state({ title: '', artist: '', description: '' });
	let editSubmitting = $state(false);

	let deleteTarget = $state<any>(null);
	let deleting = $state(false);

	// Загрузка
	let uploadDialogOpen = $state(false);
	let filesToUpload = $state<{ file: File; title: string; artist: string; description: string }[]>([]);

	const filtered = $derived(
		(data.songs?.items ?? []).filter((s: any) => {
			const q = search.toLowerCase();
			return (
				s.title.toLowerCase().includes(q) ||
				(s.artist ?? '').toLowerCase().includes(q) ||
				(s.description ?? '').toLowerCase().includes(q)
			);
		})
	);

	function formatDuration(sec: number | null): string {
		if (!sec) return '—';
		const m = Math.floor(sec / 60);
		const s = Math.floor(sec % 60);
		return `${m}:${s.toString().padStart(2, '0')}`;
	}

	function openEdit(song: any) {
		editing = song;
		editForm = {
			title: song.title,
			artist: song.artist ?? '',
			description: song.description ?? ''
		};
		editDialogOpen = true;
	}

	async function submitEdit() {
		if (!editing) return;
		editSubmitting = true;
		try {
			const resp = await fetch(`/api/radio/songs/${editing.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(editForm)
			});
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Обновлено');
			editDialogOpen = false;
			await invalidateAll();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось сохранить');
		} finally {
			editSubmitting = false;
		}
	}

	async function deleteSong() {
		if (!deleteTarget) return;
		deleting = true;
		try {
			const resp = await fetch(`/api/radio/songs/${deleteTarget.id}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Удалено');
			await invalidateAll();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось удалить');
		} finally {
			deleting = false;
			deleteTarget = null;
		}
	}

	function openUploadDialog() {
		filesToUpload = [];
		uploadDialogOpen = true;
	}

	function onFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (!input.files) return;
		for (const file of Array.from(input.files)) {
			if (!file.name.toLowerCase().endsWith('.mp3')) {
				notify.error(`${file.name} — не mp3, пропущено`);
				continue;
			}
			const guessed = file.name.replace(/\.mp3$/i, '');
			filesToUpload.push({
				file,
				title: guessed,
				artist: '',
				description: ''
			});
		}
		input.value = '';
	}

	function removeFileFromQueue(idx: number) {
		filesToUpload.splice(idx, 1);
	}

	async function uploadAll() {
		if (filesToUpload.length === 0) return;
		uploading = true;
		uploadProgress = 0;
		const total = filesToUpload.length;
		let uploaded = 0;
		let failed = 0;

		for (const item of filesToUpload) {
			try {
				const fd = new FormData();
				fd.append('file', item.file);
				fd.append('title', item.title || item.file.name);
				fd.append('artist', item.artist);
				fd.append('description', item.description);
				const resp = await fetch('/api/radio/songs', { method: 'POST', body: fd });
				if (!resp.ok) {
					const t = await resp.text();
					throw new Error(t);
				}
				uploaded++;
			} catch (e: any) {
				failed++;
				notify.error(`${item.file.name}: ${e.message ?? 'ошибка'}`);
			}
			uploadProgress = Math.round(((uploaded + failed) / total) * 100);
		}

		uploading = false;
		uploadDialogOpen = false;
		filesToUpload = [];
		if (uploaded > 0) notify.success(`Загружено: ${uploaded}${failed ? `, ошибок: ${failed}` : ''}`);
		await invalidateAll();
	}
</script>

<svelte:head>
	<title>Библиотека радио — Anathema</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div class="min-w-0">
			<a
				href="/radio"
				class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1"
			>
				<ArrowLeft class="h-3 w-3" />
				К радио
			</a>
			<h1 class="text-2xl font-bold tracking-tight flex items-center gap-2.5">
				<Music class="h-6 w-6 text-violet-400" />
				Библиотека
			</h1>
			<p class="text-sm text-muted-foreground mt-1">
				{data.songs?.total ?? 0} треков
				<span class="text-muted-foreground/50 mx-1">·</span>
				mp3, до 50 МБ
			</p>
		</div>

		<div class="flex items-center gap-2">
			<Button variant="outline" onclick={normalizeAll} disabled={normalizing} class="gap-2">
				{#if normalizing}
					<Loader2 class="h-4 w-4 animate-spin" />
				{:else}
					<RefreshCw class="h-4 w-4" />
				{/if}
				Нормализовать
			</Button>
			<Button onclick={openUploadDialog} class="gap-2">
				<Upload class="h-4 w-4" />
				Загрузить
			</Button>
		</div>
	</div>

	<!-- Очередь воспроизведения -->
	{#if queue.length > 0}
		<Card class="border-violet-500/30 bg-violet-500/5">
			<CardHeader class="pb-2 flex flex-row items-center justify-between space-y-0">
				<CardTitle class="text-sm flex items-center gap-2">
					<PlayCircle class="h-4 w-4 text-violet-400" />
					Очередь воспроизведения
					<Badge variant="outline" class="text-[10px]">{queue.length}</Badge>
				</CardTitle>
				<Button variant="ghost" size="sm" onclick={clearQueue} class="gap-1.5 text-xs h-7">
					<X class="h-3 w-3" /> Очистить
				</Button>
			</CardHeader>
			<CardContent class="pt-0">
				<ol class="space-y-1">
					{#each queue as q, i (q.song_id)}
						<li class="flex items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm">
							<span class="font-mono text-xs text-muted-foreground w-5">{i + 1}.</span>
							<div class="flex-1 min-w-0">
								<div class="font-medium truncate">{q.title}</div>
								{#if q.artist}
									<div class="text-[11px] text-muted-foreground truncate">{q.artist}</div>
								{/if}
							</div>
							<button
								type="button"
								onclick={() => removeFromQueue(q.song_id)}
								class="text-muted-foreground hover:text-destructive shrink-0"
								title="Убрать из очереди"
							>
								<X class="h-3.5 w-3.5" />
							</button>
						</li>
					{/each}
				</ol>
			</CardContent>
		</Card>
	{/if}

	<Card>
		<CardHeader class="flex flex-row items-center justify-between space-y-0 pb-3">
			<CardTitle class="text-sm text-muted-foreground font-normal">
				Всего: <span class="text-foreground font-medium">{filtered.length}</span>
			</CardTitle>
			<div class="relative w-72">
				<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input placeholder="Поиск..." bind:value={search} class="pl-9 h-9" />
			</div>
		</CardHeader>
		<CardContent class="p-0">
			{#if filtered.length === 0}
				<div class="flex flex-col items-center justify-center py-16 text-center">
					<div class="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
						<Music class="h-6 w-6 text-muted-foreground" />
					</div>
					<p class="text-sm font-medium">
						{search ? 'Ничего не найдено' : 'Библиотека пуста'}
					</p>
					<p class="text-xs text-muted-foreground mt-1">
						{search ? 'Попробуйте другой запрос' : 'Загрузите первые треки'}
					</p>
				</div>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head>Название</Table.Head>
							<Table.Head class="w-32">Длительность</Table.Head>
							<Table.Head class="w-24">Размер</Table.Head>
							<Table.Head class="w-20 text-center">Играло</Table.Head>
							<Table.Head class="w-44">Загружено</Table.Head>
							<Table.Head class="w-28 text-right">Действия</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each filtered as s (s.id)}
							<Table.Row>
								<Table.Cell>
									<div class="space-y-0.5">
										<div class="text-sm font-medium truncate">{s.title}</div>
										{#if s.artist}
											<div class="text-xs text-muted-foreground truncate">{s.artist}</div>
										{/if}
										{#if s.description}
											<div class="text-[11px] text-muted-foreground/70 truncate max-w-md italic">
												{s.description}
											</div>
										{/if}
									</div>
								</Table.Cell>
								<Table.Cell class="text-xs font-mono text-muted-foreground">
									<div class="flex items-center gap-1">
										<Clock class="h-3 w-3" />
										{formatDuration(s.duration_sec)}
									</div>
								</Table.Cell>
								<Table.Cell class="text-xs text-muted-foreground">
									{formatBytes(s.size_bytes)}
								</Table.Cell>
								<Table.Cell class="text-center">
									<Badge variant="outline" class="text-[10px]">
										{s.play_count}
									</Badge>
								</Table.Cell>
								<Table.Cell class="text-xs text-muted-foreground">
									<div>{formatDateTime(s.uploaded_at)}</div>
									{#if s.uploaded_by_username}
										<div class="text-[10px]">от {s.uploaded_by_username}</div>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right">
									<div class="flex justify-end gap-1">
										<Button
											variant="ghost"
											size="icon"
											onclick={() => addToQueue(s)}
											disabled={queueingId === s.id || queuedIds.has(s.id)}
											title={queuedIds.has(s.id) ? 'Уже в очереди' : 'Играть следующим'}
										>
											{#if queueingId === s.id}
												<Loader2 class="h-4 w-4 animate-spin" />
											{:else if queuedIds.has(s.id)}
												<ListX class="h-4 w-4 text-violet-400" />
											{:else}
												<ListPlus class="h-4 w-4" />
											{/if}
										</Button>
										<Button variant="ghost" size="icon" onclick={() => openEdit(s)}>
											<Pencil class="h-4 w-4" />
										</Button>
										<Button variant="ghost" size="icon" onclick={() => (deleteTarget = s)}>
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

<!-- Диалог загрузки -->
<Dialog.Root bind:open={uploadDialogOpen}>
	<Dialog.Content class="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>Загрузка треков</Dialog.Title>
			<Dialog.Description>Можно выбрать сразу несколько .mp3 файлов</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-2">
			<div>
				<label class="block">
					<input
						type="file"
						accept=".mp3,audio/mpeg"
						multiple
						class="hidden"
						onchange={onFileSelect}
						disabled={uploading}
					/>
					<div class="rounded-lg border-2 border-dashed border-border hover:border-primary/50 transition-colors p-6 text-center cursor-pointer">
						<FileAudio class="h-8 w-8 mx-auto text-muted-foreground mb-2" />
						<div class="text-sm font-medium">Нажми, чтобы выбрать файлы</div>
						<div class="text-xs text-muted-foreground mt-0.5">только .mp3</div>
					</div>
				</label>
			</div>

			{#if filesToUpload.length > 0}
				<div class="space-y-2 max-h-64 overflow-y-auto">
					{#each filesToUpload as item, i}
						<div class="rounded-md border bg-card p-2 space-y-1.5">
							<div class="flex items-center gap-2">
								<FileAudio class="h-3.5 w-3.5 text-muted-foreground shrink-0" />
								<span class="text-xs truncate flex-1">{item.file.name}</span>
								<span class="text-[10px] text-muted-foreground font-mono shrink-0">
									{formatBytes(item.file.size)}
								</span>
								{#if !uploading}
									<button
										type="button"
										onclick={() => removeFileFromQueue(i)}
										class="text-muted-foreground hover:text-destructive"
									>
										<Trash2 class="h-3.5 w-3.5" />
									</button>
								{/if}
							</div>
							<div class="grid grid-cols-2 gap-2">
								<Input bind:value={item.title} placeholder="Название" class="text-xs h-7" disabled={uploading} />
								<Input bind:value={item.artist} placeholder="Артист" class="text-xs h-7" disabled={uploading} />
							</div>
						</div>
					{/each}
				</div>
			{/if}

			{#if uploading}
				<div>
					<div class="text-xs text-muted-foreground mb-1">Загрузка: {uploadProgress}%</div>
					<div class="h-1.5 rounded-full bg-muted overflow-hidden">
						<div class="h-full bg-violet-500 transition-all" style="width: {uploadProgress}%"></div>
					</div>
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (uploadDialogOpen = false)} disabled={uploading}>
				Отмена
			</Button>
			<Button onclick={uploadAll} disabled={uploading || filesToUpload.length === 0} class="gap-2">
				{#if uploading}
					<Loader2 class="h-4 w-4 animate-spin" /> Загрузка...
				{:else}
					<Upload class="h-4 w-4" />
					Загрузить {filesToUpload.length}
				{/if}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Диалог редактирования -->
<Dialog.Root bind:open={editDialogOpen}>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Редактирование</Dialog.Title>
			<Dialog.Description>{editing?.title}</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-3 py-2">
			<div class="space-y-1.5">
				<label class="text-xs font-medium">Название</label>
				<Input bind:value={editForm.title} />
			</div>
			<div class="space-y-1.5">
				<label class="text-xs font-medium">Артист</label>
				<Input bind:value={editForm.artist} />
			</div>
			<div class="space-y-1.5">
				<label class="text-xs font-medium">Описание</label>
				<Textarea
					bind:value={editForm.description}
					rows={3}
					placeholder="Пара слов о треке, которые бот/радио могут использовать..."
					class="resize-y text-sm"
				/>
			</div>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => (editDialogOpen = false)}>Отмена</Button>
			<Button onclick={submitEdit} disabled={editSubmitting}>
				{editSubmitting ? 'Сохранение...' : 'Сохранить'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Подтверждение удаления -->
<AlertDialog.Root open={deleteTarget !== null} onOpenChange={(v) => !v && (deleteTarget = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Удалить трек?</AlertDialog.Title>
			<AlertDialog.Description>
				<span class="font-medium">{deleteTarget?.title}</span> будет удалён из библиотеки
				и из хранилища. Это действие необратимо.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<Button variant="outline" onclick={() => (deleteTarget = null)}>Отмена</Button>
			<Button variant="destructive" onclick={deleteSong} disabled={deleting}>
				{deleting ? 'Удаление...' : 'Удалить'}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>