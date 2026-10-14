<script lang="ts">
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { Swords, Users, ExternalLink } from 'lucide-svelte';
</script>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold tracking-tight">Игры</h1>
		<p class="text-sm text-muted-foreground">Внутренние игры Анафемы</p>
	</div>

	<Card>
		<CardHeader>
			<CardTitle class="flex items-center gap-2">
				<Swords class="h-5 w-5 text-violet-400" />
				Аспекты Штормграда
				<Badge variant="outline" class="text-[10px]">beta</Badge>
			</CardTitle>
		</CardHeader>
		<CardContent class="space-y-4">
			<p class="text-sm text-muted-foreground">
				Коллекционная карточная игра 1v1. Собирай колоды из 30 карт,
				сражайся на пятиколоночном поле, контролируй нейтральные клетки.
			</p>
			<div class="flex flex-wrap gap-2">
				<a href="/games/aspects/">
					<Button class="gap-2">
						<ExternalLink class="h-4 w-4" /> Играть
					</Button>
				</a>
				<a href="/games/aspects/decks">
					<Button variant="outline" class="gap-2">
						<Users class="h-4 w-4" /> Колоды
					</Button>
				</a>
			</div>
		</CardContent>
	</Card>
</div>