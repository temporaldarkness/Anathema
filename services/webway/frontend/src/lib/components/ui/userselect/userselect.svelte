<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';

	let {
		value = $bindable<string | null>(null),
		users = [],
		placeholder = 'Выберите пользователя...'
	}: { value?: string | null; users?: any[]; placeholder?: string } = $props();

	let open = $state(false);

	const selected = $derived(users.find((u) => u.uid === value) ?? null);

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
						<span class="text-sm">{selected.username}</span>
						<span class="font-mono text-[10px] text-muted-foreground">
							{selected.uid}
						</span>
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
				<Command.Input placeholder="Поиск по имени или uid..." />
				<Command.List>
					<Command.Empty>Не найдено.</Command.Empty>
					<Command.Group>
						{#each users as u (u.uid)}
							<Command.Item value={`${u.username} ${u.uid}`} onSelect={() => pick(u.uid)}>
								<div class="flex items-center gap-2 w-full">
									<span class="text-sm">{u.username}</span>
									<span class="font-mono text-[10px] text-muted-foreground ml-auto">
										{u.uid}
									</span>
								</div>
							</Command.Item>
						{/each}
					</Command.Group>
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>