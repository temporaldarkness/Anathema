<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { formatUptime } from '$lib/utils/format';

	let {
		name,
		check
	}: {
		name: string;
		check: {
			ok: boolean | null;
			latency_ms: number | null;
			uptime_seconds?: number | null;
		};
	} = $props();

	const state = $derived(check.ok === null ? 'unknown' : check.ok ? 'up' : 'down');
</script>

<Card>
	<CardHeader class="pb-2">
		<CardTitle class="text-xs font-medium text-muted-foreground flex items-center justify-between">
			<span>{name}</span>
			<span
				class="inline-flex h-2 w-2 rounded-full
					{state === 'up'
						? 'bg-emerald-500 shadow-[0_0_8px] shadow-emerald-500/50'
						: state === 'down'
							? 'bg-red-500 shadow-[0_0_8px] shadow-red-500/50'
							: 'bg-muted-foreground/40'}"
			></span>
		</CardTitle>
	</CardHeader>
	<CardContent>
		{#if state === 'unknown'}
			<span class="text-sm text-muted-foreground">не настроен</span>
		{:else}
			<div class="flex items-baseline gap-1.5">
				{#if check.latency_ms !== null}
					<span class="text-lg font-semibold">
						{check.latency_ms}<span class="text-xs text-muted-foreground ml-0.5">ms</span>
					</span>
				{:else}
					<span class="text-sm text-red-400">offline</span>
				{/if}
			</div>
			{#if check.uptime_seconds != null}
				<p class="text-[10px] text-muted-foreground mt-1">
					↑ {formatUptime(check.uptime_seconds)}
				</p>
			{/if}
		{/if}
	</CardContent>
</Card>