<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import * as Table from '$lib/components/ui/table';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { invalidateAll } from '$app/navigation';
	import { notify } from '$lib/utils/toast';
	import { extractError } from '$lib/utils/api';
	import ChipInput from '$lib/components/ui/chipinput';
	import * as Select from '$lib/components/ui/select';
	import { GENDERS, ORIENTATIONS, labelForGender, labelForOrientation } from '$lib/constants/enums';
	import { Users as UsersIcon, Plus, Trash2, Pencil, Search, Shield, AlertTriangle } from 'lucide-svelte';

	let { data } = $props();

	let search = $state('');
	let refreshing = $state(false);

	let editDialogOpen = $state(false);
	let editing = $state<any>(null); // null = создание, объект = редактирование
	let form = $state({
		uid: '',
		username: '',
		user_id: '',
		aliases: [] as string[],
		gender: '0',
		orientation: '0',
		allowed: false
	});
	let submitting = $state(false);
	
	const uidConflict = $derived(
		!editing && form.uid.trim().length > 0
			? findByUid(form.uid.trim())
			: null
	);
	
	const discordConflict = $derived(
		!editing && form.user_id.trim().length > 0 && /^\d+$/.test(form.user_id.trim())
			? findByDiscordId(Number(form.user_id), form.uid.trim())
			: null
	);

	let deleteTargetUid = $state<string | null>(null);
	let deleting = $state(false);

	const users = $derived(Array.isArray(data.users) ? data.users : []);
	const filtered = $derived(
		users.filter((u: any) => {
			const q = search.toLowerCase();
			return (
				u.uid?.toLowerCase().includes(q) ||
				u.username?.toLowerCase().includes(q) ||
				String(u.user_id ?? '').includes(q) ||
				(u.aliases ?? []).some((a: string) => a.toLowerCase().includes(q))
			);
		})
	);
	
	let fetchingDiscord = $state(false);
	async function fetchDiscordUser() {
		if (!form.user_id.trim()) {
			notify.error('Сначала введите Discord ID');
			return;
		}
		fetchingDiscord = true;
		try {
			const resp = await fetch(`/api/discord/user/${form.user_id}`);
			if (resp.status === 404) {
				notify.error('Пользователь не найден в Discord');
				return;
			}
			if (!resp.ok) throw new Error(await resp.text());
			const u = await resp.json();
			form.username = u.display_name;
			const set = new Set(form.aliases);
			set.add(`<@${u.id}>`);
			set.add(u.username);
			if (u.display_name !== u.username) set.add(u.display_name);
			form.aliases = [...set];
			notify.success(`Подтянуто: ${u.display_name}`);
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось загрузить из Discord');
		} finally {
			fetchingDiscord = false;
		}
	}

	function openCreate() {
		editing = null;
		form = {
			uid: '',
			username: '',
			user_id: '',
			aliases: [],
			gender: '0',
			orientation: '0',
			allowed: false
		};
		editDialogOpen = true;
	}

	function openEdit(u: any) {
		editing = u;
		form = {
			uid: u.uid,
			username: u.username,
			user_id: String(u.user_id),
			aliases: [...(u.aliases ?? [])],
			gender: String(u.gender ?? 0),
			orientation: String(u.orientation ?? 0),
			allowed: !!u.allowed
		};
		editDialogOpen = true;
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
		if (!form.uid.trim() || !form.username.trim() || !form.user_id.trim()) {
			notify.error('Заполните uid, username и Discord ID');
			return;
		}
		if (!/^\d+$/.test(form.user_id.trim())) {
			notify.error('Discord ID должен состоять только из цифр');
			return;
		}
		if (!editing) {
			const conflict = findByDiscordId(Number(form.user_id), form.uid.trim());
			if (conflict) {
				notify.error(
					`Discord ID уже занят пользователем ${conflict.uid}. Откройте его для редактирования.`
				);
				return;
			}
		}
		
		submitting = true;
		try {
			const payload = {
				uid: form.uid.trim(),
				username: form.username.trim(),
				user_id: form.user_id.trim(),
				aliases: form.aliases,
				gender: Number(form.gender),
				orientation: Number(form.orientation),
				allowed: form.allowed
			};
			const resp = await fetch('/api/users', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			if (resp.status === 409) {
				const err = await resp.json();
				notify.error(err.detail?.message ?? 'Конфликт уникальности');
				await reload();
				return;
			}
			if (!resp.ok) throw new Error(await extractError(resp));
			notify.success(editing ? 'Пользователь обновлён' : 'Пользователь создан');
			editDialogOpen = false;
			await reload();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось сохранить');
		} finally {
			submitting = false;
		}
	}

	async function deleteUser(uid: string) {
		deleting = true;
		try {
			const resp = await fetch(`/api/users/${uid}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error(await resp.text());
			notify.success('Пользователь удалён');
			await reload();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось удалить');
		} finally {
			deleting = false;
			deleteTargetUid = null;
		}
	}
	
	function findByUid(uid: string) {
		return (data.users ?? []).find((u: any) => u.uid === uid);
	}
	
	function findByDiscordId(userId: number, excludeUid: string | null = null) {
		return (data.users ?? []).find(
			(u: any) => Number(u.user_id) === userId && u.uid !== excludeUid
		);
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight">Пользователи</h1>
			<p class="text-sm text-muted-foreground">
				Зарегистрированные пользователи и их атрибуты
			</p>
		</div>
		<Button onclick={openCreate} class="gap-2">
			<Plus class="h-4 w-4" />
			Добавить
		</Button>
	</div>

	<Card>
		<CardHeader class="flex flex-row items-center justify-between space-y-0">
			<CardTitle class="text-base">
				{#if refreshing}
					<Skeleton class="h-4 w-20" />
				{:else}
					Всего: {filtered.length}
				{/if}
			</CardTitle>
			<div class="relative w-72">
				<Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
				<Input placeholder="Поиск по uid, имени, ID..." bind:value={search} class="pl-9" />
			</div>
		</CardHeader>

		<CardContent>
			{#if refreshing}
				<div class="space-y-3">
					{#each Array(5) as _}
						<div class="flex items-center gap-4">
							<Skeleton class="h-4 w-24" />
							<Skeleton class="h-4 w-32" />
							<Skeleton class="h-4 flex-1" />
							<Skeleton class="h-4 w-32" />
						</div>
					{/each}
				</div>
			{:else if filtered.length === 0}
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<div class="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
						<UsersIcon class="h-6 w-6 text-muted-foreground" />
					</div>
					<p class="text-sm font-medium">
						{search ? 'Ничего не найдено' : 'Пользователей нет'}
					</p>
					<p class="text-xs text-muted-foreground mt-1">
						{search ? 'Попробуйте другой запрос' : 'Добавьте первого пользователя'}
					</p>
				</div>
			{:else}
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-40">UID</Table.Head>
							<Table.Head class="w-40">Username</Table.Head>
							<Table.Head class="w-40">Discord ID</Table.Head>
							<Table.Head>Алиасы</Table.Head>
							<Table.Head>Пол / Ориентация</Table.Head>
							<Table.Head class="w-20 text-center">Allowed</Table.Head>
							<Table.Head class="w-28 text-right">Действия</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each filtered as u (u.uid)}
							<Table.Row>
								<Table.Cell class="font-mono text-xs">
									<div class="flex items-center gap-2">
										{#if u.allowed}
											<Shield class="h-3.5 w-3.5 text-emerald-500" />
										{/if}
										<span class="truncate" title={u.uid}>{u.uid}</span>
									</div>
								</Table.Cell>
								<Table.Cell class="font-medium">{u.username}</Table.Cell>
								<Table.Cell class="font-mono text-xs text-muted-foreground">
									{u.user_id}
								</Table.Cell>
								<Table.Cell>
									<div class="flex flex-wrap gap-1 max-w-md">
										{#each (u.aliases ?? []).slice(0, 4) as alias}
											<Badge variant="secondary" class="text-xs font-normal">
												{alias}
											</Badge>
										{/each}
										{#if (u.aliases ?? []).length > 4}
											<Badge variant="outline" class="text-xs font-normal">
												+{u.aliases.length - 4}
											</Badge>
										{/if}
										{#if (u.aliases ?? []).length === 0}
											<span class="text-xs text-muted-foreground">—</span>
										{/if}
									</div>
								</Table.Cell>
								<Table.Cell class="text-xs">
									<div class="flex flex-col gap-0.5">
										<span>{labelForGender(u.gender)}</span>
										<span class="text-muted-foreground">{labelForOrientation(u.orientation)}</span>
									</div>
								</Table.Cell>
								<Table.Cell class="text-center">
									{#if u.allowed}
										<Badge class="bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20">
											Да
										</Badge>
									{:else}
										<span class="text-xs text-muted-foreground">Нет</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="text-right">
									<div class="flex justify-end gap-1">
										<Button variant="ghost" size="icon" onclick={() => openEdit(u)}>
											<Pencil class="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											onclick={() => (deleteTargetUid = u.uid)}
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
<Dialog.Root bind:open={editDialogOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>{editing ? 'Редактировать пользователя' : 'Новый пользователь'}</Dialog.Title>
			<Dialog.Description>
				{editing ? `UID: ${editing.uid}` : 'Заполните обязательные поля'}
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4 py-2">
			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-1.5">
					<label for="f-uid" class="text-xs font-medium">UID *</label>
					<Input
						id="f-uid"
						bind:value={form.uid}
						placeholder="temporaldarkness"
						disabled={!!editing}
					/>
					{#if uidConflict}
						<div class="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
							<p class="font-medium text-amber-500">
								Пользователь с UID <span class="font-mono">{uidConflict.uid}</span> уже существует
							</p>
							<p class="mt-1 text-muted-foreground">
								Сохранение перезапишет его данные.
							</p>
							<button
								type="button"
								class="mt-1.5 text-amber-500 underline hover:no-underline"
								onclick={() => openEdit(uidConflict)}
							>
								Вместо этого отредактировать существующего
							</button>
						</div>
					{/if}
				</div>
				<div class="space-y-1.5">
					<label for="f-username" class="text-xs font-medium">Username *</label>
					<Input id="f-username" bind:value={form.username} placeholder="Temp" />
				</div>
			</div>

			<div class="space-y-1.5">
				<label for="f-userid" class="text-xs font-medium">Discord ID *</label>
				<div class="flex gap-2">
					<Input
						id="f-userid"
						bind:value={form.user_id}
						placeholder="123456789012345678"
						inputmode="numeric"
						disabled={!!editing}
						class="flex-1"
					/>
					<Button
						type="button"
						variant="outline"
						onclick={fetchDiscordUser}
						disabled={fetchingDiscord || !form.user_id.trim()}
						title="Подтянуть username и алиасы из Discord"
					>
						{fetchingDiscord ? 'Загрузка...' : 'Из Discord'}
					</Button>
				</div>
				{#if discordConflict}
					<div class="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs">
						<p class="font-medium text-destructive">
							Discord ID уже привязан к пользователю <span class="font-mono">{discordConflict.uid}</span>
						</p>
						<button
							type="button"
							class="mt-1 text-destructive underline hover:no-underline"
							onclick={() => openEdit(discordConflict)}
						>
							Открыть этого пользователя
						</button>
					</div>
				{/if}
			</div>

			<div class="space-y-1.5">
				<span class="text-xs font-medium">Алиасы</span>
				<ChipInput bind:value={form.aliases} placeholder="Темп, <@123456789>, ..." />
				<p class="text-[10px] text-muted-foreground">
					Enter — добавить. Backspace на пустом поле — удалить последний.
				</p>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-1.5">
					<label for="f-gender-select" class="text-xs font-medium">Пол</label>
					<Select.Root type="single" bind:value={form.gender}>
						<Select.Trigger id="f-gender-select" class="w-full" aria-label="Пол">
							{labelForGender(form.gender)}
						</Select.Trigger>
						<Select.Content>
							{#each GENDERS as g}
								<Select.Item value={String(g.value)} label={g.label}>
									{g.label}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>

				<div class="space-y-1.5">
					<label for="f-orient-select" class="text-xs font-medium">Ориентация</label>
					<Select.Root type="single" bind:value={form.orientation}>
						<Select.Trigger id="f-orient-select" class="w-full" aria-label="Ориентация">
							{labelForOrientation(form.orientation)}
						</Select.Trigger>
						<Select.Content>
							{#each ORIENTATIONS as o}
								<Select.Item value={String(o.value)} label={o.label}>
									{o.label}
								</Select.Item>
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
			</div>

			<div class="flex items-center justify-between rounded-lg border p-3">
				<div>
					<p class="text-sm font-medium">Allowed</p>
					<p class="text-xs text-muted-foreground">
						Разрешить использование основной AI-модели вместо Free
					</p>
				</div>
				<Switch class="transition-colors duration-200" bind:checked={form.allowed} />
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (editDialogOpen = false)}>Отмена</Button>
			<Button onclick={submitForm} disabled={submitting || !!discordConflict}>
				{submitting ? 'Сохранение...' : 'Сохранить'}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Подтверждение удаления -->
<AlertDialog.Root open={deleteTargetUid !== null} onOpenChange={(v) => !v && (deleteTargetUid = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Удалить пользователя?</AlertDialog.Title>
			<AlertDialog.Description>
				Пользователь <span class="font-mono">{deleteTargetUid}</span> будет удалён вместе со
				связанными реакциями.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<Button variant="outline" onclick={() => (deleteTargetUid = null)}>Отмена</Button>
			<Button
				variant="destructive"
				onclick={() => deleteTargetUid && deleteUser(deleteTargetUid)}
				disabled={deleting}
			>
				{deleting ? 'Удаление...' : 'Удалить'}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>