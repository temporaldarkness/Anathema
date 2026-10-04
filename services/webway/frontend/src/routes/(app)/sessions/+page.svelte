<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { invalidateAll } from '$app/navigation';
	import { notify } from '$lib/utils/toast';
	import { formatDateTime } from '$lib/utils/format';
	import { Monitor, Globe, X, ShieldOff } from 'lucide-svelte';

	let { data } = $props();

	let revokeTarget = $state<string | null>(null);
	let revoking = $state(false);

	async function revokeSession(sid: string) {
		revoking = true;
		try {
			const resp = await fetch(`/api/sessions/${sid}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Сессия завершена');
			await invalidateAll();
		} catch (e: any) {
			notify.error(e.message ?? 'Ошибка');
		} finally {
			revoking = false;
			revokeTarget = null;
		}
	}

	async function revokeAll() {
		try {
			const resp = await fetch('/api/sessions/revoke-all', { method: 'POST' });
			if (!resp.ok) throw new Error(await resp.text());
			const body = await resp.json();
			notify.success(`Завершено сессий: ${body.revoked}`);
			await invalidateAll();
		} catch (e: any) {
			notify.error(e.message ?? 'Ошибка');
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Мои сессии</h1>
			<p class="text-sm text-muted-foreground mt-1">
				Устройства и браузеры, через которые ты вошёл в панель
			</p>
		</div>
		{#if data.sessions.length > 1}
			<Button variant="outline" onclick={revokeAll} class="gap-2">
				<ShieldOff class="h-4 w-4" />
				Завершить все, кроме этой
			</Button>
		{/if}
	</div>

	<div class="grid gap-3">
		{#each data.sessions as s (s.session_id)}
			<Card class={s.is_current ? 'border-violet-500/40' : ''}>
				<CardContent class="p-4 flex items-start gap-4">
					<div class="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
						<Monitor class="h-5 w-5 text-muted-foreground" />
					</div>
					<div class="flex-1 min-w-0">
						<div class="flex items-center gap-2 flex-wrap">
							<span class="font-medium truncate">{s.username}</span>
							{#if s.is_current}
								<Badge class="text-[10px] bg-violet-500/15 text-violet-400 border-violet-500/30">
									это устройство
								</Badge>
							{/if}
							{#if s.is_admin}
								<Badge variant="outline" class="text-[10px]">admin</Badge>
							{/if}
						</div>
						<div class="text-xs text-muted-foreground mt-1 space-y-0.5">
							<div>Последняя активность: {formatDateTime(s.last_seen)}</div>
							<div>Создана: {formatDateTime(s.created_at)}</div>
							{#if s.ip}
								<div class="flex items-center gap-1"><Globe class="h-3 w-3" /> {s.ip}</div>
							{/if}
							{#if s.user_agent}
								<div class="truncate font-mono text-[10px]" title={s.user_agent}>
									{s.user_agent}
								</div>
							{/if}
						</div>
					</div>
					{#if !s.is_current}
						<Button
							variant="ghost"
							size="icon"
							onclick={() => (revokeTarget = s.session_id)}
							title="Завершить сессию"
						>
							<X class="h-4 w-4 text-destructive" />
						</Button>
					{/if}
				</CardContent>
			</Card>
		{/each}
	</div>
</div>

<AlertDialog.Root open={revokeTarget !== null} onOpenChange={(v) => !v && (revokeTarget = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Завершить сессию?</AlertDialog.Title>
			<AlertDialog.Description>
				Устройство будет вылогинено. Ему придётся зайти заново через Discord.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<Button variant="outline" onclick={() => (revokeTarget = null)}>Отмена</Button>
			<Button
				variant="destructive"
				onclick={() => revokeTarget && revokeSession(revokeTarget)}
				disabled={revoking}
			>
				{revoking ? 'Завершение...' : 'Завершить'}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>