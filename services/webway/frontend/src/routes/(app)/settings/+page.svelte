<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Switch } from '$lib/components/ui/switch';
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { invalidateAll } from '$app/navigation';
	import { notify } from '$lib/utils/toast';
	import { SETTINGS_SCHEMA, SETTINGS_DEFAULTS } from '$lib/constants/settings';
	import { RotateCcw, AlertTriangle, Check } from 'lucide-svelte';

	let { data } = $props();

	let values = $state<Record<string, string>>({ ...data.values });
	let saving = $state<Record<string, boolean>>({});
	let justSaved = $state<Record<string, boolean>>({});

	// Сброс на дефолт
	let resetTarget = $state<string | null>(null);
	let resetting = $state(false);

	// Синхронизация, если серверные данные обновились (например, после invalidateAll)
	$effect(() => {
		values = { ...data.values };
	});

	const isBool = (v: string) => v === 'true';

	function isModified(key: string) {
		return data.values[key] !== SETTINGS_DEFAULTS[key];
	}

	async function saveSetting(key: string, newValue: string | number | boolean) {
		const valueStr =
			typeof newValue === 'boolean' ? (newValue ? 'true' : 'false') : String(newValue);

		// Не дёргаем бэкенд, если значение не изменилось
		if (values[key] === valueStr && data.values[key] === valueStr) {
			values[key] = valueStr;
			return;
		}

		const prev = values[key];
		values[key] = valueStr;
		saving[key] = true;
		try {
			const resp = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key, value: valueStr })
			});
			if (!resp.ok) throw new Error(await resp.text());

			// Обновляем локальную «серверную» копию, чтобы isModified пересчитался
			data.values[key] = valueStr;

			// Кратковременный чекмарк
			justSaved[key] = true;
			setTimeout(() => {
				justSaved[key] = false;
			}, 1500);
		} catch (e: any) {
			values[key] = prev;
			notify.error(e.message ?? 'Не удалось сохранить');
		} finally {
			saving[key] = false;
		}
	}

	async function resetToDefault(key: string) {
		resetting = true;
		try {
			const resp = await fetch(`/api/settings/${key}/reset`, { method: 'POST' });
			if (!resp.ok) throw new Error(await resp.text());
			values[key] = SETTINGS_DEFAULTS[key] ?? values[key];
			notify.success(`Сброшено: ${key}`);
			resetTarget = null;
			await invalidateAll();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось сбросить');
		} finally {
			resetting = false;
		}
	}
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold tracking-tight">Настройки</h1>
		<p class="text-sm text-muted-foreground">Конфигурация поведения бота</p>
	</div>

	{#each SETTINGS_SCHEMA as group}
		<Card class={group.id === 'danger' ? 'border-destructive/30' : ''}>
			<CardHeader>
				<CardTitle class="flex items-center gap-2 text-base">
					{#if group.id === 'danger'}
						<AlertTriangle class="h-4 w-4 text-destructive" />
					{/if}
					{group.title}
				</CardTitle>
				{#if group.description}
					<CardDescription>{group.description}</CardDescription>
				{/if}
			</CardHeader>
			<CardContent class="divide-y">
				{#each group.items as setting}
					<div class="flex items-start justify-between gap-6 py-4 first:pt-0 last:pb-0">
						<!-- Левая часть: название + описание -->
						<div class="flex-1 min-w-0">
							<div class="flex items-center gap-2 flex-wrap">
								<span class="text-sm font-medium">{setting.label}</span>

								{#if saving[setting.key]}
									<span
										class="inline-flex h-3 w-3 animate-pulse rounded-full bg-amber-400"
										title="Сохранение..."
									></span>
								{:else if justSaved[setting.key]}
									<Check class="h-3.5 w-3.5 text-emerald-500" />
								{/if}

								{#if isModified(setting.key)}
									<button
										type="button"
										class="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
										onclick={() => (resetTarget = setting.key)}
										title="Сбросить до значения по умолчанию"
									>
										<RotateCcw class="inline h-3 w-3" />
									</button>
								{/if}
							</div>

							{#if setting.description}
								<p class="text-xs text-muted-foreground mt-0.5">
									{setting.description}
								</p>
							{/if}

							<code class="font-mono text-[10px] text-muted-foreground/60 mt-1 block">
								{setting.key}
							</code>
						</div>

						<!-- Правая часть: контрол -->
						<div class="shrink-0 w-48 flex justify-end items-center gap-2">
							{#if setting.type === 'boolean'}
								<Switch
									checked={isBool(values[setting.key])}
									onCheckedChange={(v) => saveSetting(setting.key, v)}
									disabled={saving[setting.key]}
								/>
							{:else if setting.type === 'number'}
								<Input
									type="number"
									bind:value={values[setting.key]}
									min={setting.min}
									max={setting.max}
									class="w-24 text-right"
									onblur={() => saveSetting(setting.key, values[setting.key])}
									onkeydown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
								/>
								{#if setting.min !== undefined && setting.max !== undefined}
									<span class="text-[10px] text-muted-foreground whitespace-nowrap">
										{setting.min}–{setting.max}
									</span>
								{/if}
							{:else if setting.type === 'select'}
								<Select.Root
									type="single"
									value={values[setting.key]}
									onValueChange={(v) => v && saveSetting(setting.key, v)}
								>
									<Select.Trigger class="w-48">
										{values[setting.key]}
									</Select.Trigger>
									<Select.Content>
										{#each setting.options ?? [] as opt}
											<Select.Item value={opt} label={opt}>
												{opt}
											</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							{:else}
								<Input
									bind:value={values[setting.key]}
									class="w-48"
									onblur={() => saveSetting(setting.key, values[setting.key])}
								/>
							{/if}
						</div>
					</div>
				{/each}
			</CardContent>
		</Card>
	{/each}
</div>

<!-- Сброс настройки -->
<AlertDialog.Root open={resetTarget !== null} onOpenChange={(v) => !v && (resetTarget = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Сбросить настройку?</AlertDialog.Title>
			<AlertDialog.Description>
				<span class="font-mono">{resetTarget}</span> вернётся к значению по умолчанию:{' '}
				<span class="font-mono">{resetTarget ? SETTINGS_DEFAULTS[resetTarget] : ''}</span>.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<Button variant="outline" onclick={() => (resetTarget = null)}>Отмена</Button>
			<Button
				onclick={() => resetTarget && resetToDefault(resetTarget)}
				disabled={resetting}
			>
				{resetting ? 'Сброс...' : 'Сбросить'}
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>