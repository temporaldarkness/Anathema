<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';

	let {
		title,
		icon: Icon,
		items,
		loading = false,
		emptyText = 'Нет данных'
	}: {
		title: string;
		icon: any;
		items: { label: string; sublabel?: string; count: number }[] | null;
		loading?: boolean;
		emptyText?: string;
	} = $props();

	const max = $derived(items ? Math.max(1, ...items.map((i) => i.count)) : 1);
</script>

<div class="rounded-xl border bg-card p-4">
	<h3 class="text-sm font-medium mb-4 flex items-center gap-2">
		<Icon class="h-4 w-4 text-muted-foreground" />
		{title}
	</h3>

	{#if loading}
		<div class="space-y-2">
			{#each Array(5) as _}<Skeleton class="h-8 w-full" />{/each}
		</div>
	{:else if !items || items.length === 0}
		<div class="h-32 flex items-center justify-center text-xs text-muted-foreground">
			{emptyText}
		</div>
	{:else}
		<ul class="space-y-2">
			{#each items as item, i}
				<li class="relative">
					<div
						class="absolute inset-y-0 left-0 rounded bg-violet-500/10"
						style="width: {(item.count / max) * 100}%"
					></div>
					<div class="relative flex items-center justify-between px-2 py-1.5 text-xs">
						<div class="flex items-center gap-2 min-w-0">
							<span class="text-muted-foreground font-mono w-5 text-right shrink-0">
								{i + 1}.
							</span>
							<div class="min-w-0">
								<div class="font-medium truncate">{item.label}</div>
								{#if item.sublabel}
									<div class="text-[10px] text-muted-foreground font-mono truncate">
										{item.sublabel}
									</div>
								{/if}
							</div>
						</div>
						<span class="font-mono text-xs font-medium shrink-0 ml-2">{item.count}</span>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>