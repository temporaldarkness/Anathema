<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { notify } from '$lib/utils/toast';
	import { formatDateTime } from '$lib/utils/format';
	import {
		Hash, Send, RefreshCw, AlertCircle, MessageSquare, Megaphone,
		Lock, Loader2, Bot
	} from 'lucide-svelte';

	let { data } = $props();

	// --- Каналы (из server load) ---
	const channels = $derived(data.channels ?? []);

	// Группировка по категориям
	type Group = { name: string; channels: typeof channels };
	const grouped = $derived.by(() => {
		const groups: Group[] = [];
		const map = new Map<string, Group>();
		for (const c of channels) {
			const key = c.parent_name ?? '__root__';
			if (!map.has(key)) {
				const g: Group = { name: c.parent_name ?? 'Без категории', channels: [] };
				map.set(key, g);
				groups.push(g);
			}
			map.get(key)!.channels.push(c);
		}
		return groups;
	});

	// --- Состояние выбранного канала ---
	let activeChannelId = $state<string | null>(null);
	let messages = $state<any[]>([]);
	let loadingMessages = $state(false);
	let messagesError = $state<string | null>(null);

	// --- Композер ---
	let composerText = $state('');
	let sending = $state(false);

	// --- Автообновление ---
	let autoRefresh = $state(false);
	let refreshInterval: ReturnType<typeof setInterval> | null = null;

	const activeChannel = $derived(
		channels.find((c: any) => c.id === activeChannelId) ?? null
	);

	async function loadMessages(channelId: string) {
		loadingMessages = true;
		messagesError = null;
		try {
			const resp = await fetch(`/api/eyes/channels/${channelId}/messages?limit=50`);
			if (!resp.ok) {
				const detail = await resp.text();
				throw new Error(detail || `HTTP ${resp.status}`);
			}
			const body = await resp.json();
			// Discord отдаёт новые сверху — перевернём для удобного чтения
			messages = (body.messages ?? []).slice().reverse();
		} catch (e: any) {
			messagesError = e.message ?? 'Не удалось загрузить сообщения';
			messages = [];
		} finally {
			loadingMessages = false;
		}
	}

	function selectChannel(id: string) {
		activeChannelId = id;
		messages = [];
		loadMessages(id);
	}

	async function sendMessage() {
		if (!activeChannelId || !composerText.trim()) return;
		sending = true;
		try {
			const resp = await fetch(`/api/eyes/channels/${activeChannelId}/send`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: composerText.trim() })
			});
			if (!resp.ok) {
				const detail = await resp.text();
				throw new Error(detail || `HTTP ${resp.status}`);
			}
			composerText = '';
			notify.success('Сообщение отправлено');
			await loadMessages(activeChannelId);
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось отправить сообщение');
		} finally {
			sending = false;
		}
	}

	// Автообновление
	$effect(() => {
		if (autoRefresh && activeChannelId) {
			refreshInterval = setInterval(() => {
				if (!sending && activeChannelId) loadMessages(activeChannelId);
			}, 5000);
			return () => {
				if (refreshInterval) clearInterval(refreshInterval);
			};
		}
	});

	function channelIcon(c: any) {
		if (c.type === 5) return Megaphone;
		if (c.nsfw) return Lock;
		return Hash;
	}

	function authorDisplay(a: any) {
		return a.global_name || a.username || 'Unknown';
	}
</script>

<svelte:head>
	<title>Discord глазами — Anathema</title>
</svelte:head>

<div class="flex h-[calc(100vh-8rem)] gap-4">
	<!-- ==================== SIDEBAR: CHANNELS ==================== -->
	<aside class="w-64 shrink-0 rounded-xl border bg-card overflow-hidden flex flex-col">
		<div class="px-3 py-2.5 border-b flex items-center gap-2">
			<MessageSquare class="h-4 w-4 text-muted-foreground" />
			<h2 class="text-sm font-semibold flex-1">Каналы</h2>
			<Badge variant="outline" class="text-[10px] px-1.5 py-0">
				{channels.length}
			</Badge>
		</div>

		<div class="flex-1 overflow-y-auto p-2 space-y-3">
			{#if channels.length === 0}
				<div class="py-10 text-center text-xs text-muted-foreground">
					Каналов не найдено
				</div>
			{:else}
				{#each grouped as g}
					<div>
						<div class="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
							{g.name}
						</div>
						<div class="space-y-0.5">
							{#each g.channels as c (c.id)}
								{@const Icon = channelIcon(c)}
								<button
									type="button"
									onclick={() => selectChannel(c.id)}
									class="w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-1.5 transition-colors
										{activeChannelId === c.id
											? 'bg-accent text-accent-foreground'
											: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
									title={c.topic ?? c.name}
								>
									<Icon class="h-3.5 w-3.5 shrink-0" />
									<span class="truncate">{c.name}</span>
								</button>
							{/each}
						</div>
					</div>
				{/each}
			{/if}
		</div>
	</aside>

	<!-- ==================== MAIN: MESSAGES ==================== -->
	<main class="flex-1 rounded-xl border bg-card overflow-hidden flex flex-col min-w-0">
		{#if !activeChannel}
			<div class="flex-1 flex flex-col items-center justify-center text-center px-6">
				<div class="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
					<MessageSquare class="h-7 w-7 text-muted-foreground" />
				</div>
				<h3 class="text-sm font-medium">Выберите канал</h3>
				<p class="text-xs text-muted-foreground mt-1">
					Слева — список каналов сервера, как их видит бот
				</p>
			</div>
		{:else}
			<!-- Header -->
			<div class="px-4 py-2.5 border-b flex items-center gap-3">
				<Hash class="h-4 w-4 text-muted-foreground shrink-0" />
				<div class="flex-1 min-w-0">
					<div class="text-sm font-semibold truncate">
						{activeChannel.name}
					</div>
					{#if activeChannel.topic}
						<div class="text-[11px] text-muted-foreground truncate">
							{activeChannel.topic}
						</div>
					{/if}
				</div>
				<label class="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
					<input
						type="checkbox"
						bind:checked={autoRefresh}
						class="accent-primary"
					/>
					авто 5с
				</label>
				<Button
					variant="ghost"
					size="icon"
					onclick={() => activeChannelId && loadMessages(activeChannelId)}
					disabled={loadingMessages}
					title="Обновить"
				>
					<RefreshCw class="h-4 w-4 {loadingMessages ? 'animate-spin' : ''}" />
				</Button>
			</div>

			<!-- Messages -->
			<div class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
				{#if loadingMessages && messages.length === 0}
					{#each Array(6) as _}
						<div class="flex gap-3">
							<Skeleton class="h-8 w-8 rounded-full shrink-0" />
							<div class="flex-1 space-y-1.5">
								<Skeleton class="h-3 w-32" />
								<Skeleton class="h-4 w-full max-w-md" />
							</div>
						</div>
					{/each}
				{:else if messagesError}
					<div class="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
						<AlertCircle class="h-4 w-4 shrink-0 mt-0.5" />
						<div>{messagesError}</div>
					</div>
				{:else if messages.length === 0}
					<div class="text-center text-xs text-muted-foreground py-10">
						Сообщений нет
					</div>
				{:else}
					{#each messages as m (m.id)}
						<div class="flex gap-3 group">
							<!-- Avatar -->
							<div class="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0 overflow-hidden">
								{#if m.author.avatar}
									<img
										src="https://cdn.discordapp.com/avatars/{m.author.id}/{m.author.avatar}.png?size=64"
										alt=""
										class="h-full w-full object-cover"
									/>
								{:else}
									{authorDisplay(m.author).slice(0, 2).toUpperCase()}
								{/if}
							</div>
							<div class="flex-1 min-w-0">
								<div class="flex items-baseline gap-2 flex-wrap">
									<span class="text-xs font-semibold">
										{authorDisplay(m.author)}
									</span>
									{#if m.author.bot}
										<Badge class="text-[9px] px-1 py-0 gap-0.5 bg-blue-500/15 text-blue-400 border-blue-500/30">
											<Bot class="h-2.5 w-2.5" /> bot
										</Badge>
									{/if}
									<span class="text-[10px] text-muted-foreground">
										{formatDateTime(m.timestamp)}
									</span>
								</div>

								{#if m.referenced_message}
									<div class="mt-1 flex items-start gap-1.5 text-[11px] text-muted-foreground border-l-2 border-muted pl-2">
										<span class="font-medium">{m.referenced_message.author_username}:</span>
										<span class="truncate">{m.referenced_message.content}</span>
									</div>
								{/if}

								{#if m.content}
									<div class="text-sm whitespace-pre-wrap break-words mt-0.5">
										{m.content}
									</div>
								{/if}

								{#if m.attachments?.length > 0}
									<div class="mt-2 flex flex-wrap gap-2">
										{#each m.attachments as a}
											{#if a.content_type?.startsWith('image/')}
												<a href={a.url} target="_blank" rel="noopener noreferrer">
													<img
														src={a.url}
														alt={a.filename}
														class="max-h-48 max-w-xs rounded border"
														loading="lazy"
													/>
												</a>
											{:else}
												<a
													href={a.url}
													target="_blank"
													rel="noopener noreferrer"
													class="text-xs text-blue-400 hover:underline"
												>
													📎 {a.filename}
												</a>
											{/if}
										{/each}
									</div>
								{/if}
							</div>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Composer -->
			<div class="border-t p-3">
				<div class="flex items-end gap-2">
					<textarea
						bind:value={composerText}
						placeholder="Написать от имени бота в #{activeChannel.name}..."
						rows="2"
						maxlength="2000"
						class="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
						onkeydown={(e) => {
							if (e.key === 'Enter' && !e.shiftKey) {
								e.preventDefault();
								sendMessage();
							}
						}}
					></textarea>
					<Button
						onclick={sendMessage}
						disabled={sending || !composerText.trim()}
						size="icon"
						title="Отправить (Enter)"
					>
						{#if sending}
							<Loader2 class="h-4 w-4 animate-spin" />
						{:else}
							<Send class="h-4 w-4" />
						{/if}
					</Button>
				</div>
				<div class="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
					<span>Enter — отправить, Shift+Enter — новая строка</span>
					<span>{composerText.length} / 2000</span>
				</div>
			</div>
		{/if}
	</main>
</div>