<script lang="ts">
	import { emoteCdnUrl } from '$lib/utils/discord_emote';

	let {
		source,
		size = 24,
		title = ''
	}: { source: string; size?: number; title?: string } = $props();

	const isCustom = $derived(/^\d{15,}$/.test(source));
	const url = $derived(isCustom ? emoteCdnUrl(source, size * 2) : '');
</script>

{#if isCustom}
	<img
		src={url}
		alt={title}
		{title}
		width={size}
		height={size}
		class="inline-block object-contain"
		loading="lazy"
	/>
{:else}
	<span {title} style="font-size: {size - 4}px; line-height: {size}px;">{source}</span>
{/if}