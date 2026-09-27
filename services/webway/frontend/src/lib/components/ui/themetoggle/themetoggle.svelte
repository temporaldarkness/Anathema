<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Sun, Moon, Monitor } from 'lucide-svelte';

	type Theme = 'light' | 'dark' | 'system';
	let theme = $state<Theme>('dark');

	$effect(() => {
		const saved = (localStorage.getItem('theme') as Theme) ?? 'dark';
		theme = saved;
	});

	function applyTheme(t: Theme) {
		theme = t;
		localStorage.setItem('theme', t);
		const isDark =
			t === 'dark' ||
			(t === 'system' && !window.matchMedia('(prefers-color-scheme: light)').matches);
		document.documentElement.classList.toggle('dark', isDark);
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<Button variant="ghost" size="icon" {...props}>
				{#if theme === 'light'}
					<Sun class="h-4 w-4" />
				{:else if theme === 'dark'}
					<Moon class="h-4 w-4" />
				{:else}
					<Monitor class="h-4 w-4" />
				{/if}
				<span class="sr-only">Тема</span>
			</Button>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Item onclick={() => applyTheme('light')}>
			<Sun class="mr-2 h-4 w-4" /> Светлая
		</DropdownMenu.Item>
		<DropdownMenu.Item onclick={() => applyTheme('dark')}>
			<Moon class="mr-2 h-4 w-4" /> Тёмная
		</DropdownMenu.Item>
		<DropdownMenu.Item onclick={() => applyTheme('system')}>
			<Monitor class="mr-2 h-4 w-4" /> Системная
		</DropdownMenu.Item>
	</DropdownMenu.Content>
</DropdownMenu.Root>