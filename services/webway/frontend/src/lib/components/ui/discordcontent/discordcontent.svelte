<script lang="ts">
	import { parseDiscordContent } from '$lib/utils/discord_render';

	let {
		content,
		users = {},
		channels = {}
	}: {
		content: string;
		users?: Record<string, { username?: string; global_name?: string }>;
		channels?: Record<string, { name?: string }>;
	} = $props();

	const parts = $derived(parseDiscordContent(content));

	const URL_RE = /^https?:\/\//;

	function userName(id: string): string {
		const u = users[id];
		return u?.global_name || u?.username || id;
	}
	function channelName(id: string): string {
		return channels[id]?.name ?? id;
	}
</script>

<span class="whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">
	{#each parts as part}
		{#if part.type === 'text'}
			{#if URL_RE.test(part.value.trim())}
				<a
					href={part.value.trim()}
					target="_blank"
					rel="noopener noreferrer"
					class="text-blue-400 hover:underline"
				>{part.value}</a>
			{:else}
				{part.value}
			{/if}
		{:else if part.type === 'user'}
			<span
				class="rounded bg-blue-500/15 px-1 py-0.5 text-blue-400 font-medium cursor-pointer hover:bg-blue-500/25 transition-colors"
				title="ID: {part.id}"
			>
				@{userName(part.id)}
			</span>
		{:else if part.type === 'role'}
			<span
				class="rounded bg-violet-500/15 px-1 py-0.5 text-violet-400 font-medium"
				title="Role ID: {part.id}"
			>
				@role
			</span>
		{:else if part.type === 'channel'}
			<span
				class="rounded bg-emerald-500/15 px-1 py-0.5 text-emerald-400 font-medium"
				title="Channel ID: {part.id}"
			>
				#{channelName(part.id)}
			</span>
		{:else if part.type === 'emoji'}
			<img
				src="https://cdn.discordapp.com/emojis/{part.id}.{part.animated ? 'gif' : 'webp'}?size=44"
				alt=":{part.name}:"
				title=":{part.name}:"
				class="inline-block h-5 w-5 align-text-bottom"
				loading="lazy"
			/>
		{/if}
	{/each}
</span>