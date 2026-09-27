<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { notify } from '$lib/utils/toast';
	import { formatDateTime } from '$lib/utils/format';
	import { extractUserMentionIds } from '$lib/utils/discord_render';
	import DiscordContent from '$lib/components/ui/discordcontent';
	import {
		Hash, Send, RefreshCw, AlertCircle, MessageSquare, Megaphone,
		Lock, Loader2, Bot, Reply, X
	} from 'lucide-svelte';

	let { data } = $props();

	// --- Каналы (из server load) ---
	const channels = $derived(data.channels ?? []);

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

	// --- Кэш авторов и каналов для рендера mentions ---
	let usersCache = $state<Record<string, any>>({});
	let channelsCache = $state<Record<string, any>>({});

	// Заполняем cache каналов из server load
	$effect(() => {
		if (channels.length > 0) {
			const next = { ...channelsCache };
			let changed = false;
			for (const c of channels) {
				if (!next[c.id]) {
					next[c.id] = c;
					changed = true;
				}
			}
			if (changed) channelsCache = next;
		}
	});

	// --- Состояние выбранного канала ---
	let activeChannelId = $state<string | null>(null);
	let messages = $state<any[]>([]);
	let loadingMessages = $state(false);
	let messagesError = $state<string | null>(null);

	// --- Композер ---
	let composerText = $state('');
	let sending = $state(false);
	let textareaEl = $state<HTMLTextAreaElement | null>(null);

	// --- Reply ---
	let replyTo = $state<any>(null);

	// --- Mention autocomplete ---
	let mentionQuery = $state<string | null>(null);
	let mentionAnchor = $state(0);

	const mentionCandidates = $derived.by(() => {
		if (mentionQuery === null) return [];
		const q = mentionQuery.toLowerCase();
		return Object.values(usersCache)
			.filter((u: any) => {
				const name = (u.global_name || u.username || '').toLowerCase();
				return name.includes(q);
			})
			.slice(0, 6);
	});

	// --- Автообновление ---
	let autoRefresh = $state(false);

	const activeChannel = $derived(
		channels.find((c: any) => c.id === activeChannelId) ?? null
	);

	async function resolveMentions(newMessages: any[]) {
		const localUsers: Record<string, any> = { ...usersCache };
		const missing = new Set<string>();

		for (const m of newMessages) {
			if (m.author?.id) localUsers[m.author.id] = m.author;
			for (const uid of extractUserMentionIds(m.content ?? '')) {
				if (!localUsers[uid]) missing.add(uid);
			}
		}

		if (missing.size > 0) {
			try {
				const resp = await fetch('/api/discord/users/batch', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ ids: [...missing] })
				});
				if (resp.ok) {
					const body = await resp.json();
					Object.assign(localUsers, body.users ?? {});
				}
			} catch {
				// тихо игнорируем — fallback покажет ID
			}
		}

		usersCache = localUsers;
	}

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
			messages = (body.messages ?? []).slice().reverse();
			await resolveMentions(messages);
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
		replyTo = null;
		loadMessages(id);
	}

	async function sendMessage() {
		if (!activeChannelId || !composerText.trim()) return;
		sending = true;
		try {
			const body: any = { content: composerText.trim() };
			if (replyTo) body.reply_to = replyTo.id;
			const resp = await fetch(`/api/eyes/channels/${activeChannelId}/send`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			if (!resp.ok) {
				const detail = await resp.text();
				throw new Error(detail || `HTTP ${resp.status}`);
			}
			composerText = '';
			replyTo = null;
			mentionQuery = null;
			notify.success('Сообщение отправлено');
			await loadMessages(activeChannelId);
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось отправить сообщение');
		} finally {
			sending = false;
		}
	}

	function onComposerInput(e: Event) {
		const ta = e.target as HTMLTextAreaElement;
		const value = ta.value;
		const pos = ta.selectionStart;
		const before = value.slice(0, pos);
		const at = before.lastIndexOf('@');
		if (at >= 0) {
			const segment = before.slice(at);
			// Условие: @ в начале или после пробела, и после него нет пробелов
			const prevChar = at > 0 ? before[at - 1] : ' ';
			if (/\s/.test(prevChar) && !/\s/.test(segment.slice(1))) {
				mentionQuery = segment.slice(1);
				mentionAnchor = at;
				return;
			}
		}
		mentionQuery = null;
	}

	function insertMention(id: string) {
		if (!textareaEl) return;
		const value = composerText;
		const pos = textareaEl.selectionStart ?? value.length;
		const before = value.slice(0, mentionAnchor);
		const after = value.slice(pos);
		const token = `<@${id}> `;
		composerText = before + token + after;
		mentionQuery = null;
		setTimeout(() => {
			if (!textareaEl) return;
			const newPos = before.length + token.length;
			textareaEl.focus();
			textareaEl.setSelectionRange(newPos, newPos);
		}, 0);
	}

	function handleComposerKeydown(e: KeyboardEvent) {
		if (mentionQuery !== null && e.key === 'Escape') {
			e.preventDefault();
			mentionQuery = null;
			return;
		}
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (mentionQuery !== null && mentionCandidates.length > 0) {
				insertMention(mentionCandidates[0].id);
			} else {
				sendMessage();
			}
		}
	}

	function channelIcon(c: any) {
		if (c.type === 5) return Megaphone;
		if (c.nsfw) return Lock;
		return Hash;
	}

	function authorDisplay(a: any) {
		return a.global_name || a.username || 'Unknown';
	}

	function authorInitials(a: any) {
		const n = authorDisplay(a);
		return n.slice(0, 2).toUpperCase();
	}

	// Автообновление
	$effect(() => {
		if (autoRefresh && activeChannelId) {
			const id = setInterval(() => {
				if (!sending && activeChannelId) loadMessages(activeChannelId);
			}, 5000);
			return () => clearInterval(id);
		}
	});
</script>

<svelte:head>
	<title>Discord глазами — Anathema</title>
</svelte:head>

<div class="flex h-[calc(100vh-8rem)] gap-4">
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
					<input type="checkbox" bind:checked={autoRefresh} class="accent-primary" />
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
			<div class="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-3">
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
						<div class="flex gap-3 group relative min-w-0">
							<!-- Avatar -->
							<div class="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-medium shrink-0 overflow-hidden">
								{#if m.author.avatar}
									<img
										src="https://cdn.discordapp.com/avatars/{m.author.id}/{m.author.avatar}.png?size=64"
										alt=""
										class="h-full w-full object-cover"
									/>
								{:else}
									{authorInitials(m.author)}
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
										<span class="font-medium shrink-0">{m.referenced_message.author_username}:</span>
										<span class="truncate">{m.referenced_message.content}</span>
									</div>
								{/if}

								{#if m.content}
									<div class="mt-0.5">
										<DiscordContent
											content={m.content}
											users={usersCache}
											channels={channelsCache}
										/>
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

							<!-- Reply button -->
							<button
								type="button"
								onclick={() => (replyTo = m)}
								class="absolute -top-1 right-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-md bg-card border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-1 z-10"
							>
								<Reply class="h-3 w-3" />
								Ответить
							</button>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Composer -->
			<div class="border-t p-3 relative">
				<!-- Mention dropdown -->
				{#if mentionCandidates.length > 0}
					<div class="absolute bottom-full left-3 mb-2 w-72 rounded-md border bg-popover shadow-lg z-50 overflow-hidden">
						{#each mentionCandidates as u}
							<button
								type="button"
								onclick={() => insertMention(u.id)}
								class="w-full text-left px-2.5 py-1.5 text-xs hover:bg-accent flex items-center gap-2"
							>
								<span class="font-medium">{u.global_name || u.username}</span>
								<span class="ml-auto text-[10px] text-muted-foreground font-mono">{u.username}</span>
							</button>
						{/each}
					</div>
				{/if}

				<!-- Reply preview -->
				{#if replyTo}
					<div class="mb-2 flex items-center gap-2 rounded-md border bg-muted/50 px-2.5 py-1.5 text-[11px]">
						<Reply class="h-3 w-3 text-muted-foreground shrink-0" />
						<div class="flex-1 min-w-0 flex items-baseline gap-1.5">
							<span class="font-medium shrink-0">{authorDisplay(replyTo.author)}</span>
							<span class="text-muted-foreground truncate">{replyTo.content}</span>
						</div>
						<button
							type="button"
							onclick={() => (replyTo = null)}
							class="text-muted-foreground hover:text-foreground shrink-0"
						>
							<X class="h-3 w-3" />
						</button>
					</div>
				{/if}

				<div class="flex items-end gap-2">
					<textarea
						bind:this={textareaEl}
						bind:value={composerText}
						oninput={onComposerInput}
						onkeydown={handleComposerKeydown}
						placeholder="Написать от имени бота в #{activeChannel.name}..."
						rows="2"
						maxlength="2000"
						class="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
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
					<span>Enter — отправить, Shift+Enter — новая строка, @ — упомянуть</span>
					<span>{composerText.length} / 2000</span>
				</div>
			</div>
		{/if}
	</main>
</div>