<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '$lib/components/ui/card';
</script>

<svelte:head>
	<title>Anathema — вход</title>
</svelte:head>

<div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
	<!-- Фоновые декоративные пятна -->
	<div class="pointer-events-none absolute inset-0 z-0">
		<div
			class="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-violet-500/20 blur-3xl"
		></div>
		<div
			class="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-blue-500/20 blur-3xl"
		></div>
		<div
			class="absolute top-1/2 left-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fuchsia-500/10 blur-3xl"
		></div>
	</div>

	<Card class="relative z-10 w-full max-w-md border-border/60 shadow-2xl backdrop-blur-sm">
		<CardHeader class="space-y-3 text-center">
			<div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 shadow-lg">
				<span class="text-2xl font-bold text-white">A</span>
			</div>
			<CardTitle class="text-2xl">Anathema</CardTitle>
			<CardDescription>Панель управления ботом</CardDescription>
		</CardHeader>

		<CardContent class="space-y-4">
			<a href="/auth/discord/login" class="block">
				<Button
					class="w-full gap-2 bg-[#5865F2] text-white hover:bg-[#4752C4] transition-colors"
					size="lg"
				>
					<!-- Иконка Discord (SVG) -->
					<svg
						class="h-5 w-5"
						viewBox="0 0 24 24"
						fill="currentColor"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path
							d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"
						/>
					</svg>
					Войти через Discord
				</Button>
			</a>

			<p class="text-center text-xs text-muted-foreground">
				Доступ только для участников сервера с соответствующими правами.
			</p>
		</CardContent>
	</Card>

	<p class="absolute bottom-6 z-10 text-center text-xs text-muted-foreground">
		temporaldarkness · {new Date().getFullYear()}
	</p>
</div>