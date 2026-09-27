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
		Hash,
		Star
	} from 'lucide-svelte';

	let { data } = $props();

	let tab = $state<'all' | 'favorites'>('all');
	let items = $state<any[]>(data.gallery?.items ?? []);
	let total = $state<number>(data.gallery?.total ?? 0);
	let refreshing = $state(false);
	let loadedOnce = $state(false);

	let lightbox = $state<any>(null);
	let deleteTarget = $state<string | null>(null);
	let deleting = $state(false);

	function imgUrl(fileId: string) {
		return `/api/gallery/file/${fileId}`;
	}

	async function loadItems() {
		refreshing = true;
		try {
			const params = new URLSearchParams({ limit: '60', offset: '0' });
			if (tab === 'favorites') params.set('favorites_only', 'true');
			const resp = await fetch(`/api/gallery?${params}`);
			if (!resp.ok) throw new Error(await resp.text());
			const body = await resp.json();
			items = body.items ?? [];
			total = body.total ?? 0;
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось загрузить');
			items = [];
			total = 0;
		} finally {
			refreshing = false;
			loadedOnce = true;
		}
	}

	// При смене таба — перезагрузка
	$effect(() => {
		// Явно "читаем" tab, чтобы effect зависел от него
		const _ = tab;
		loadItems();
	});

	async function toggleFavorite(item: any, e: MouseEvent) {
		e.stopPropagation();
		const isFav = !item.is_favorite;
		// Оптимистично
		item.is_favorite = isFav;
		try {
			const resp = await fetch(`/api/gallery/${item.file_id}/favorite`, {
				method: isFav ? 'POST' : 'DELETE'
			});
			if (!resp.ok) throw new Error(await resp.text());
			notify.success(isFav ? 'В избранном' : 'Убрано из избранного');
			if (lightbox && lightbox.file_id === item.file_id) {
				lightbox.is_favorite = isFav;
			}
			// Если смотрим «Избранные» и только что убрали — обновим список
			if (tab === 'favorites' && !isFav) {
				await loadItems();
			}
		} catch (e: any) {
			item.is_favorite = !isFav;
			notify.error(e.message ?? 'Ошибка');
		}
	}

	async function deleteImage(fileId: string) {
		deleting = true;
		try {
			const resp = await fetch(`/api/gallery/${fileId}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Изображение удалено');
			lightbox = null;
			await loadItems();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось удалить');
		} finally {
			deleting = false;
			deleteTarget = null;
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between gap-4 flex-wrap">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Галерея</h1>
			<p class="text-sm text-muted-foreground">
				{tab === 'all'
					? 'Сгенерированные изображения. Файлы автоматически удаляются через 24 часа.'
					: 'Избранные изображения хранятся бессрочно.'}
			</p>
		</div>
		<div class="flex items-center gap-2">
			<!-- Переключатель вкладок -->
			<div class="flex rounded-md border bg-card p-0.5">
				<button
					type="button"
					onclick={() => (tab = 'all')}
					class="px-3 py-1 text-xs rounded-sm transition-colors flex items-center gap-1.5
						{tab === 'all'
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
				>
					<ImageIcon class="h-3.5 w-3.5" />
					Все
				</button>
				<button
					type="button"
					onclick={() => (tab = 'favorites')}
					class="px-3 py-1 text-xs rounded-sm transition-colors flex items-center gap-1.5
						{tab === 'favorites'
							? 'bg-accent text-accent-foreground'
							: 'text-muted-foreground hover:text-foreground'}"
				>
					<Star class="h-3.5 w-3.5" />
					Избранные
				</button>
			</div>
			<Badge variant="outline" class="gap-1">{total}</Badge>
			<Button variant="outline" onclick={loadItems} disabled={refreshing} class="gap-2">
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
					{#if tab === 'favorites'}
						<Star class="h-7 w-7 text-muted-foreground" />
					{:else}
						<ImageIcon class="h-7 w-7 text-muted-foreground" />
					{/if}
				</div>
				<p class="text-sm font-medium">
					{tab === 'favorites' ? 'Нет избранных изображений' : 'Галерея пуста'}
				</p>
				<p class="text-xs text-muted-foreground mt-1">
					{tab === 'favorites'
						? 'Отметьте звёздочкой понравившиеся картинки — они попадут сюда.'
						: 'Сгенерируйте изображение через /image или /edit в Discord.'}
				</p>
			</div>
		</Card>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
			{#each items as item (item.file_id)}
				<div
					role="button"
					tabindex="0"
					class="group relative cursor-pointer overflow-hidden rounded-xl border bg-card transition-all hover:border-primary/50 hover:shadow-lg"
					onclick={() => (lightbox = item)}
					onkeydown={(e) => e.key === 'Enter' && (lightbox = item)}
				>
					<!-- Звёздочка -->
					<button
						type="button"
						onclick={(e) => toggleFavorite(item, e)}
						class="absolute top-2 right-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 backdrop-blur transition-all hover:bg-black/80"
						title={item.is_favorite ? 'Убрать из избранного' : 'Добавить в избранное'}
					>
						<Star
							class="h-4 w-4 {item.is_favorite
								? 'fill-amber-400 text-amber-400'
								: 'text-white'}"
						/>
					</button>

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
						class="absolute inset-0 flex flex-col justify-between bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none"
					>
						<div class="flex justify-end p-2 pr-12">
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
				</div>
			{/each}
		</div>
	{/if}
</div>

<!-- Лайтбокс -->
<Dialog.Root open={lightbox !== null} onOpenChange={(v) => !v && (lightbox = null)}>
	<Dialog.Content class="sm:max-w-4xl max-h-[92vh] p-0 overflow-hidden">
		{#if lightbox}
			<div class="grid md:grid-cols-[1fr_280px]">
				<div class="flex items-center justify-center bg-zinc-950 min-h-[300px]">
					<img
						src={imgUrl(lightbox.file_id)}
						alt=""
						class="max-h-[80vh] w-auto object-contain"
					/>
				</div>

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
						<Button
							variant={lightbox.is_favorite ? 'default' : 'outline'}
							class="w-full gap-2"
							onclick={() => toggleFavorite(lightbox, new MouseEvent('click'))}
						>
							<Star class="h-4 w-4 {lightbox.is_favorite ? 'fill-current' : ''}" />
							{lightbox.is_favorite ? 'В избранном' : 'В избранное'}
						</Button>
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