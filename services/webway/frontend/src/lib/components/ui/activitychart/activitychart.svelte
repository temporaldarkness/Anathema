<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { formatDateTime } from '$lib/utils/format';

	let {
		title,
		buckets,
		unit = 'сообщений',
		hours = 24,
		loading = false
	}: {
		title: string;
		buckets: { bucket: string; count: number }[] | null;
		unit?: string;
		hours?: number;
		loading?: boolean;
	} = $props();

	// Заполняем пропуски в бакетах (часы без сообщений)
	function fillGaps(
		raw: { bucket: string; count: number }[],
		hours: number
	): { bucket: string; count: number }[] {
		const now = new Date();
		now.setMinutes(0, 0, 0);
		const map = new Map<string, number>();
		for (const r of raw) {
			const d = new Date(r.bucket);
			d.setMinutes(0, 0, 0);
			map.set(d.toISOString(), r.count);
		}
		const out = [];
		for (let i = hours - 1; i >= 0; i--) {
			const d = new Date(now.getTime() - i * 3600 * 1000);
			const key = d.toISOString();
			out.push({ bucket: key, count: map.get(key) ?? 0 });
		}
		return out;
	}

	const filled = $derived(buckets ? fillGaps(buckets, hours) : []);
	const max = $derived(Math.max(1, ...filled.map((b) => b.count)));
	const total = $derived(filled.reduce((s, b) => s + b.count, 0));
</script>

<div class="rounded-xl border bg-card p-4">
	<div class="flex items-baseline justify-between mb-4">
		<h3 class="text-sm font-medium">{title}</h3>
		<div class="flex items-baseline gap-2">
			<span class="text-2xl font-bold">{total}</span>
			<span class="text-xs text-muted-foreground">{unit} за {hours}ч</span>
		</div>
	</div>

	{#if loading}
		<Skeleton class="h-32 w-full" />
	{:else if filled.length === 0}
		<div class="h-32 flex items-center justify-center text-xs text-muted-foreground">
			Нет данных
		</div>
	{:else}
		<div class="flex items-end gap-0.5 h-32">
			{#each filled as b}
				<div
					class="flex-1 rounded-t bg-gradient-to-t from-violet-500/40 to-violet-500 hover:from-violet-500/60 hover:to-violet-400 transition-all cursor-default group relative"
					style="height: {Math.max(2, (b.count / max) * 100)}%"
					title="{new Date(b.bucket).toLocaleString('ru-RU', {
						day: '2-digit',
						month: '2-digit',
						hour: '2-digit',
						minute: '2-digit'
					})}: {b.count} {unit}"
				>
					{#if b.count > 0}
						<span
							class="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-popover px-1.5 py-0.5 rounded border"
						>
							{b.count}
						</span>
					{/if}
				</div>
			{/each}
		</div>

		<!-- Ось X -->
		<div class="flex justify-between mt-2 text-[10px] text-muted-foreground">
			<span>{new Date(filled[0].bucket).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
			<span>сейчас</span>
		</div>
	{/if}
</div>