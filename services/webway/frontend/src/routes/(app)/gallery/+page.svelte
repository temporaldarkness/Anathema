<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card } from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { invalidateAll } from '$app/navigation';
	import { notify } from '$lib/utils/toast';
	import { formatBytes, formatDateTime } from '$lib/utils/format';
	import {
		Image as ImageIcon,
		Download,
		Trash2,
		RefreshCw,
		Maximize2,
		Wand2,
		Pencil,
		User as UserIcon,
		Hash
	} from 'lucide-svelte';

	let { data } = $props();

	let refreshing = $state(false);
	let lightbox = $state<any>(null);
	let deleteTarget = $state<string | null>(null);
	let deleting = $state(false);

	const items = $derived(data.gallery?.items ?? []);
	const total = $derived(data.gallery?.total ?? 0);

	function imgUrl(fileId: string) {
		// Отдаём как /api/gallery/file/{id} — проксируем через backend
		return `/api/gallery/file/${fileId}`;
	}

	async function reload() {
		refreshing = true;
		try {
			await invalidateAll();
		} finally {
			refreshing = false;
		}
	}

	async function deleteImage(fileId: string) {
		deleting = true;
		try {
			const resp = await fetch(`/api/gallery/${fileId}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Изображение удалено');
			lightbox = null;
			await reload();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось удалить');
		} finally {
			deleting = false;
			deleteTarget = null;
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Галерея</h1>
			<p class="text-sm text-muted-foreground">
				Сгенерированные изображения. Файлы автоматически удаляются через 24 часа.
			</p>
		</div>
		<div class="flex items-center gap-2">
			<Badge variant="outline" class="gap-1">
				<ImageIcon class="h-3 w-3" />
				{total}
			</Badge>
			<Button variant="outline" onclick={reload} disabled={refreshing} class="gap-2">
				<RefreshCw class="h-4 w-4 {refreshing ? 'animate-spin' : ''}" />
				Обновить
			</Button>
		</div>
	</div>

	{#if refreshing && items.length === 0}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each Array(8) as _}
				<Skeleton class="aspect-square rounded-xl" />
			{/each}
		</div>
	{:else if items.length === 0}
		<Card>
			<div class="flex flex-col items-center justify-center py-20 text-center">
				<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
					<ImageIcon class="h-7 w-7 text-muted-foreground" />
				</div>
				<p class="text-sm font-medium">Галерея пуста</p>
				<p class="text-xs text-muted-foreground mt-1">
					Сгенерируйте изображение через /изображение в Discord.
				</p>
			</div>
		</Card>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each items as item (item.file_id)}
				<button
					type="button"
					class="group relative overflow-hidden rounded-xl border bg-card transition-all hover:border-primary/50 hover:shadow-lg"
					onclick={() => (lightbox = item)}
				>
					<div class="aspect-square overflow-hidden bg-muted">
						<img
							src={imgUrl(item.file_id)}
							alt=""
							loading="lazy"
							class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
						/>
					</div>

					<!-- Hover overlay -->
					<div
						class="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
					>
						<div class="flex justify-end p-2">
							<Maximize2 class="h-4 w-4 text-white drop-shadow" />
						</div>
						<div class="p-3 text-left">
							{#if item.metadata?.command === 'generate'}
								<Badge class="gap-1 bg-violet-500/80 text-white border-0 text-[10px]">
									<Wand2 class="h-2.5 w-2.5" /> generate
								</Badge>
							{:else if item.metadata?.command === 'edit'}
								<Badge class="gap-1 bg-blue-500/80 text-white border-0 text-[10px]">
									<Pencil class="h-2.5 w-2.5" /> edit
								</Badge>
							{:else if item.metadata?.source === 'gateway'}
								<Badge class="gap-1 bg-zinc-500/80 text-white border-0 text-[10px]">
									attachment
								</Badge>
							{/if}
							{#if item.metadata?.prompt}
								<p class="mt-1.5 text-xs text-white/90 line-clamp-2">
									{item.metadata.prompt}
								</p>
							{/if}
						</div>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>

<!-- Лайтбокс -->
<Dialog.Root open={lightbox !== null} onOpenChange={(v) => !v && (lightbox = null)}>
	<Dialog.Content class="sm:max-w-4xl max-h-[92vh] p-0 overflow-hidden">
		{#if lightbox}
			<div class="grid md:grid-cols-[1fr_280px]">
				<!-- Изображение -->
				<div class="flex items-center justify-center bg-zinc-950 min-h-[300px]">
					<img
						src={imgUrl(lightbox.file_id)}
						alt=""
						class="max-h-[80vh] w-auto object-contain"
					/>
				</div>

				<!-- Метаданные -->
				<div class="flex flex-col border-l bg-card p-4 space-y-4 overflow-y-auto">
					<Dialog.Header class="space-y-1 p-0">
						<Dialog.Title class="text-sm">Метаданные</Dialog.Title>
						<Dialog.Description class="text-xs">
							{formatDateTime(lightbox.last_modified)}
						</Dialog.Description>
					</Dialog.Header>

					<dl class="space-y-3 text-xs">
						<div>
							<dt class="text-muted-foreground mb-0.5">File ID</dt>
							<dd class="font-mono break-all">{lightbox.file_id}</dd>
						</div>
						<div>
							<dt class="text-muted-foreground mb-0.5">Размер</dt>
							<dd>{formatBytes(lightbox.size)}</dd>
						</div>
						{#if lightbox.metadata?.source}
							<div>
								<dt class="text-muted-foreground mb-0.5 flex items-center gap-1">
									<Hash class="h-3 w-3" /> source
								</dt>
								<dd class="font-mono">{lightbox.metadata.source}</dd>
							</div>
						{/if}
						{#if lightbox.metadata?.command}
							<div>
								<dt class="text-muted-foreground mb-0.5">command</dt>
								<dd class="font-mono">{lightbox.metadata.command}</dd>
							</div>
						{/if}
						{#if lightbox.metadata?.user_id}
							<div>
								<dt class="text-muted-foreground mb-0.5 flex items-center gap-1">
									<UserIcon class="h-3 w-3" /> Discord ID
								</dt>
								<dd class="font-mono">{lightbox.metadata.user_id}</dd>
							</div>
						{/if}
						{#if lightbox.metadata?.prompt}
							<div>
								<dt class="text-muted-foreground mb-0.5">Промпт</dt>
								<dd class="whitespace-pre-wrap break-words text-[11px] bg-muted rounded p-2 max-h-40 overflow-y-auto">
									{lightbox.metadata.prompt}
								</dd>
							</div>
						{/if}
					</dl>

					<div class="mt-auto pt-4 flex flex-col gap-2">
						<a href={imgUrl(lightbox.file_id)} download class="w-full">
							<Button variant="outline" class="w-full gap-2">
								<Download class="h-4 w-4" />
								Скачать
							</Button>
						</a>
						<Button
							variant="destructive"
							class="w-full gap-2"
							onclick={() => (deleteTarget = lightbox.file_id)}
						>
							<Trash2 class="h-4 w-4" />
							Удалить
						</Button>
					</div>
				</div>
			</div>
		{/if}
	</Dialog.Content>
</Dialog.Root>

<!-- Подтверждение удаления -->
<AlertDialog.Root open={deleteTarget !== null} onOpenChange={(v) => !v && (deleteTarget = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Удалить изображение?</AlertDialog.Title>
			<AlertDialog.Description>
				Файл будет удалён из хранилища. Действие необратимо.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<Button variant="outline" onclick={() => (deleteTarget = null)}>Отмена</Button>
			<Button
				variant="destructive"
				onclick={() => deleteTarget && deleteImage(deleteTarget)}
				disabled={deleting}
			>
				{deleting ? 'Удаление...' : 'Удалить'}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>