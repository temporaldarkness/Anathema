<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Badge } from '$lib/components/ui/badge';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { notify } from '$lib/utils/toast';
	import { Trash2, Plus, BookOpen, ScrollText } from 'lucide-svelte';

	let {
		open = $bindable(false),
		user,
		canEdit = false
	}: { open?: boolean; user: any; canEdit?: boolean } = $props();

	let loading = $state(false);
	let items = $state<any[]>([]);
	let newFactText = $state('');
	let newRuleText = $state('');
	let submittingFact = $state(false);
	let submittingRule = $state(false);
	let deleteTarget = $state<number | null>(null);

	// Перезагрузка при смене пользователя
	$effect(() => {
		if (open && user?.uid) {
			loadTrivia();
		}
	});

	async function loadTrivia() {
		loading = true;
		try {
			const resp = await fetch(`/api/users/${user.uid}/trivia`);
			if (!resp.ok) throw new Error(await resp.text());
			items = await resp.json();
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось загрузить');
			items = [];
		} finally {
			loading = false;
		}
	}

	const facts = $derived(items.filter((i) => i.kind === 'fact'));
	const rules = $derived(items.filter((i) => i.kind === 'rule'));

	async function addItem(kind: 'fact' | 'rule') {
		const text = kind === 'fact' ? newFactText.trim() : newRuleText.trim();
		if (!text) return;
		const flag = kind === 'fact' ? submittingFact : submittingRule;
		if (flag) return;

		if (kind === 'fact') submittingFact = true;
		else submittingRule = true;

		try {
			const resp = await fetch(`/api/users/${user.uid}/trivia`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ kind, content: text })
			});
			if (!resp.ok) throw new Error(await resp.text());
			if (kind === 'fact') newFactText = '';
			else newRuleText = '';
			await loadTrivia();
			notify.success('Добавлено');
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось добавить');
		} finally {
			if (kind === 'fact') submittingFact = false;
			else submittingRule = false;
		}
	}

	async function deleteItem(id: number) {
		try {
			const resp = await fetch(`/api/trivia/${id}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error(await resp.text());
			await loadTrivia();
			notify.success('Удалено');
		} catch (e: any) {
			notify.error(e.message ?? 'Не удалось удалить');
		} finally {
			deleteTarget = null;
		}
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>
				Заметки · {user?.username}
			</Dialog.Title>
			<Dialog.Description>
				Факты и индивидуальные правила, которые бот учитывает при ответе этому пользователю
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-5 py-3">
			<!-- Факты -->
			<section>
				<div class="flex items-center gap-2 mb-2">
					<BookOpen class="h-4 w-4 text-blue-400" />
					<h3 class="text-sm font-semibold">Факты</h3>
					<Badge variant="outline" class="text-[10px]">{facts.length}</Badge>
				</div>

				{#if loading}
					<div class="space-y-2">
						{#each Array(2) as _}<Skeleton class="h-8" />{/each}
					</div>
				{:else}
					<ul class="space-y-1.5 mb-3">
						{#each facts as f (f.id)}
							<li class="flex items-start gap-2 rounded-md border bg-card px-3 py-2 text-sm group">
								<span class="flex-1">{f.content}</span>
								{#if canEdit}
									<button
										type="button"
										onclick={() => (deleteTarget = f.id)}
										class="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
									>
										<Trash2 class="h-3.5 w-3.5" />
									</button>
								{/if}
							</li>
						{/each}
						{#if facts.length === 0}
							<li class="text-xs text-muted-foreground text-center py-2">Нет фактов</li>
						{/if}
					</ul>

					{#if canEdit}
						<div class="flex gap-2">
							<Input
								bind:value={newFactText}
								placeholder="Например: любит кошек"
								onkeydown={(e) => e.key === 'Enter' && addItem('fact')}
							/>
							<Button
								size="icon"
								onclick={() => addItem('fact')}
								disabled={submittingFact || !newFactText.trim()}
							>
								<Plus class="h-4 w-4" />
							</Button>
						</div>
					{/if}
				{/if}
			</section>

			<!-- Правила -->
			<section>
				<div class="flex items-center gap-2 mb-2">
					<ScrollText class="h-4 w-4 text-amber-400" />
					<h3 class="text-sm font-semibold">Индивидуальные правила</h3>
					<Badge variant="outline" class="text-[10px]">{rules.length}</Badge>
				</div>

				{#if loading}
					<div class="space-y-2">
						{#each Array(2) as _}<Skeleton class="h-8" />{/each}
					</div>
				{:else}
					<ul class="space-y-1.5 mb-3">
						{#each rules as r (r.id)}
							<li class="flex items-start gap-2 rounded-md border bg-card px-3 py-2 text-sm group">
								<span class="flex-1">{r.content}</span>
								{#if canEdit}
									<button
										type="button"
										onclick={() => (deleteTarget = r.id)}
										class="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
									>
										<Trash2 class="h-3.5 w-3.5" />
									</button>
								{/if}
							</li>
						{/each}
						{#if rules.length === 0}
							<li class="text-xs text-muted-foreground text-center py-2">Нет правил</li>
						{/if}
					</ul>

					{#if canEdit}
						<div class="flex gap-2">
							<Input
								bind:value={newRuleText}
								placeholder="Например: не обсуждать политику"
								onkeydown={(e) => e.key === 'Enter' && addItem('rule')}
							/>
							<Button
								size="icon"
								onclick={() => addItem('rule')}
								disabled={submittingRule || !newRuleText.trim()}
							>
								<Plus class="h-4 w-4" />
							</Button>
						</div>
					{/if}
				{/if}
			</section>
		</div>
	</Dialog.Content>
</Dialog.Root>

<AlertDialog.Root open={deleteTarget !== null} onOpenChange={(v) => !v && (deleteTarget = null)}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Удалить запись?</AlertDialog.Title>
			<AlertDialog.Description>Это действие необратимо.</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<Button variant="outline" onclick={() => (deleteTarget = null)}>Отмена</Button>
			<Button
				variant="destructive"
				onclick={() => deleteTarget !== null && deleteItem(deleteTarget)}
			>
				Удалить
			</Button>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>