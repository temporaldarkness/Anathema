<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from '$lib/components/ui/sonner';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}

<Toaster
	position="bottom-right"
	theme="dark"
	richColors
	closeButton
	toastOptions={{
		classes: {
			toast: 'border-border bg-card text-card-foreground'
		}
	}}
/>