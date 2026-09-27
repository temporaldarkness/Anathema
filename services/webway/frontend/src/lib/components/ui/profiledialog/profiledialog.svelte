<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Copy, Check, ShieldCheck, User as UserIcon, LogOut } from 'lucide-svelte';

	let {
		open = $bindable(false),
		user
	}: { open?: boolean; user: { user_id: number; username: string; is_admin: boolean; expires_at?: number | null } } =
		$props();

	let copied = $state(false);

	async function copyId() {
		await navigator.clipboard.writeText(String(user.user_id));
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	const initials = $derived(user.username.slice(0, 2).toUpperCase());

	const expiresLabel = $derived.by(() => {
		if (!user.expires_at) return '—';
		const d = new Date(user.expires_at * 1000);
		return d.toLocaleString('ru-RU');
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title>Профиль</Dialog.Title>
			<Dialog.Description>Ваша учётная запись в Webway</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-2">
			<!-- Шапка -->
			<div class="flex items-center gap-3">
				<Avatar class="h-14 w-14">
					{#if user.avatar_url}
						<AvatarImage src={user.avatar_url} alt={user.username} class="object-cover" />
					{/if}
					<AvatarFallback
						class="bg-gradient-to-br from-violet-500 to-blue-500 text-base font-semibold text-white"
					>
						{user.username.slice(0, 2).toUpperCase()}
					</AvatarFallback>
				</Avatar>
				<div class="min-w-0">
					<div class="text-base font-semibold truncate">{user.username}</div>
					<div class="flex items-center gap-1.5 mt-0.5">
						{#if user.is_admin}
							<Badge
								class="gap-1 bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]"
							>
								<ShieldCheck class="h-3 w-3" /> Администратор
							</Badge>
						{:else}
							<Badge variant="outline" class="gap-1 text-[10px]">
								<UserIcon class="h-3 w-3" /> Пользователь
							</Badge>
						{/if}
					</div>
				</div>
			</div>

			<!-- Детали -->
			<dl class="space-y-3 rounded-lg border p-3 text-sm">
				<div class="flex items-center justify-between gap-2">
					<dt class="text-xs text-muted-foreground">Discord ID</dt>
					<dd class="flex items-center gap-1.5">
						<code class="font-mono text-xs">{user.user_id}</code>
						<Button
							variant="ghost"
							size="icon"
							class="h-6 w-6"
							onclick={copyId}
							title="Скопировать"
						>
							{#if copied}
								<Check class="h-3 w-3 text-emerald-500" />
							{:else}
								<Copy class="h-3 w-3" />
							{/if}
						</Button>
					</dd>
				</div>
				<div class="flex items-center justify-between gap-2">
					<dt class="text-xs text-muted-foreground">Сессия истекает</dt>
					<dd class="text-xs">{expiresLabel}</dd>
				</div>
				<div class="flex items-center justify-between gap-2">
					<dt class="text-xs text-muted-foreground">Провайдер</dt>
					<dd class="text-xs">Discord OAuth2</dd>
				</div>
			</dl>

			{#if user.is_admin}
				<div
					class="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 p-2.5 text-[11px]"
				>
					<ShieldCheck class="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
					<p class="text-muted-foreground">
						У вас полный доступ ко всем разделам, включая настройки и удаление данных.
					</p>
				</div>
			{/if}
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (open = false)}>Закрыть</Button>
			<form method="POST" action="/auth/logout" class="inline">
				<Button type="submit" variant="destructive" class="gap-2">
					<LogOut class="h-4 w-4" />
					Выйти
				</Button>
			</form>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>