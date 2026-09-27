<script lang="ts">
	import { X } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';

	let {
		value = $bindable<string[]>([]),
		placeholder = 'Введите и нажмите Enter...'
	}: { value?: string[]; placeholder?: string } = $props();

	let inputValue = $state('');

	function normalize(raw: string): string {
		// <@!123> → <@123> (Discord иногда шлёт с восклицательным знаком)
		return raw.trim().replace(/^<@!(\d+)>$/, '<@$1>');
	}

	function addChip() {
		const trimmed = normalize(inputValue);
		if (!trimmed) return;
		if (!value.includes(trimmed)) {
			value = [...value, trimmed];
		}
		inputValue = '';
	}

	function removeChip(index: number) {
		value = value.filter((_, i) => i !== index);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			addChip();
		} else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
			removeChip(value.length - 1);
		}
	}
</script>

<div
	class="flex min-h-10 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm transition-colors focus-within:ring-1 focus-within:ring-ring"
>
	{#each value as chip, i (chip)}
		<Badge variant="secondary" class="gap-1 pr-1 font-normal">
			<span class="font-mono text-xs">{chip}</span>
			<button
				type="button"
				class="rounded-sm p-0.5 hover:bg-muted-foreground/20 transition-colors"
				onclick={() => removeChip(i)}
				aria-label="Удалить"
			>
				<X class="h-3 w-3" />
			</button>
		</Badge>
	{/each}
	<input
		class="min-w-32 flex-1 bg-transparent px-1 outline-none placeholder:text-muted-foreground"
		bind:value={inputValue}
		onkeydown={handleKeydown}
		onblur={addChip}
		{placeholder}
	/>
</div>