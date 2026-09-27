<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import EmotePreview from '$lib/components/ui/emotepreview';

	let {
		value = $bindable<string | null>(null),
		emotes = [],
		placeholder = 'Выберите эмодзи...'
	}: { value?: string | null; emotes?: any[]; placeholder?: string } = $props();

	let open = $state(false);

	const selected = $derived(emotes.find((e) => e.uid === value) ?? null);

	function pick(uid: string) {
		value = uid;
		open = false;
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<Button
				variant="outline"
				role="combobox"
				aria-expanded={open}
				class="w-full justify-start font-normal"
				{...props}
			>
				{#if selected}
					<div class="flex items-center gap-2">
						<EmotePreview source={selected.source} size={20} />
						<span class="font-mono text-xs">{selected.human_code ?? selected.uid}</span>
					</div>
				{:else}
					<span class="text-muted-foreground">{placeholder}</span>
				{/if}
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content class="w-[320px] p-0" align="start">
			<Command.Root>
				<Command.Input placeholder="Поиск эмодзи..." />
				<Command.List>
					<Command.Empty>Не найдено.</Command.Empty>
					<Command.Group>
						{#each emotes as e (e.uid)}
							<Command.Item value={e.uid} onSelect={() => pick(e.uid)}>
								<div class="flex items-center gap-2 w-full">
									<EmotePreview source={e.source} size={20} />
									<span class="font-mono text-xs">{e.human_code ?? e.uid}</span>
									{#if e.description}
										<span class="text-xs text-muted-foreground truncate ml-auto">
											{e.description}
										</span>
									{/if}
								</div>
							</Command.Item>
						{/each}
					</Command.Group>
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>