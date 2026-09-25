<script lang="ts">
	import { onNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { Button } from '$lib/components/ui/button';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { ThemeToggle } from '$lib/components/ui/themetoggle';
	import {
		LayoutDashboard,
		Brain,
		Users,
		Hash,
		Smile,
		Zap,
		Settings,
		Image as ImageIcon,
		ScrollText,
		LogOut,
		User,
		ChevronDown
	} from 'lucide-svelte';
	import { fade } from 'svelte/transition';

	let { data, children } = $props();

	const navGroups = [
		{
			label: 'Обзор',
			items: [{ href: '/dashboard', label: 'Дашборд', icon: LayoutDashboard }]
		},
		{
			label: 'Данные',
			items: [
				{ href: '/ltm', label: 'Память (LTM)', icon: Brain },
				{ href: '/users', label: 'Пользователи', icon: Users },
				{ href: '/channels', label: 'Каналы', icon: Hash },
				{ href: '/emotes', label: 'Эмодзи', icon: Smile }
			]
		},
		{
			label: 'Реакции и медиа',
			items: [
				{ href: '/reactions', label: 'Реакции', icon: Zap },
				{ href: '/gallery', label: 'Галерея', icon: ImageIcon }
			]
		},
		{
			label: 'Система',
			items: [
				{ href: '/settings', label: 'Настройки', icon: Settings },
				{ href: '/audit', label: 'Аудит', icon: ScrollText }
			]
		}
	];

	onNavigate((navigation) => {
		if (typeof document === 'undefined' || !document.startViewTransition) return;
		return new Promise<void>((resolve) => {
			document.startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	const currentPath = $derived(page.url.pathname);
	const isActive = (href: string) => currentPath.startsWith(href);
	const pageLabel = $derived(currentPath.split('/').filter(Boolean).pop() ?? 'панель');
</script>

{#if data?.user}
	<div class="flex min-h-screen bg-background">
		<!-- Sidebar -->
		<aside class="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card lg:flex">
			<!-- Логотип -->
			<div class="flex h-16 items-center gap-3 border-b px-6">
				<div
					class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 shadow"
				>
					<span class="text-sm font-bold text-white">A</span>
				</div>
				<div>
					<h1 class="text-sm font-semibold leading-none">Anathema</h1>
					<p class="text-[10px] text-muted-foreground leading-none mt-1">Bot Panel</p>
				</div>
			</div>

			<!-- Навигация -->
			<nav class="flex-1 overflow-y-auto p-3">
				{#each navGroups as group}
					<div class="mb-4">
						<p
							class="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
						>
							{group.label}
						</p>
						<div class="flex flex-col gap-0.5">
							{#each group.items as item}
								<a
									href={item.href}
									class="group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors
										{isActive(item.href)
											? 'bg-accent text-accent-foreground'
											: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
								>
									{#if isActive(item.href)}
										<span
											class="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary"
										></span>
									{/if}
									<item.icon class="h-4 w-4 shrink-0" />
									{item.label}
								</a>
							{/each}
						</div>
					</div>
				{/each}
			</nav>

			<!-- Футер -->
			<div class="border-t p-3">
				<div class="flex items-center gap-2 px-3 py-2 text-[10px] text-muted-foreground">
					<span class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
					v0.1.0
				</div>
			</div>
		</aside>

		<!-- Main area -->
		<div class="flex flex-1 flex-col lg:pl-64">
			<!-- Header -->
			<header
				class="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/60"
			>
				<div class="flex items-center gap-2 text-sm text-muted-foreground">
					<span class="text-foreground font-medium">Anathema</span>
					<span class="text-muted-foreground">/</span>
					<span>{pageLabel}</span>
				</div>
				
				<div class="flex items-center gap-2">
					<ThemeToggle />

					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props })}
								<button
									{...props}
									class="group flex items-center gap-2 rounded-full border border-transparent py-1 pl-1 pr-3 text-sm font-medium transition-all
										hover:border-border hover:bg-accent/50
										data-[state=open]:border-border data-[state=open]:bg-accent/50"
								>
									<Avatar class="h-7 w-7 shrink-0 ring-1 ring-border">
										{#if data.user.avatar_url}
											<AvatarImage src={data.user.avatar_url} alt={data.user.username} class="object-cover" />
										{/if}
										<AvatarFallback class="bg-gradient-to-br from-violet-500 to-blue-500 text-[10px] font-semibold text-white">
											{data.user.username.slice(0, 2).toUpperCase()}
										</AvatarFallback>
									</Avatar>
									<span class="hidden sm:inline">{data.user.username}</span>
									<ChevronDown class="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
								</button>
							{/snippet}
						</DropdownMenu.Trigger>

						<DropdownMenu.Content align="end" sideOffset={8} class="w-64 p-1.5">
							<div class="flex items-center gap-3 rounded-md px-2 py-2">
								<Avatar class="h-10 w-10 shrink-0">
									{#if data.user.avatar_url}
										<AvatarImage src={data.user.avatar_url} alt={data.user.username} class="object-cover" />
									{/if}
									<AvatarFallback class="bg-gradient-to-br from-violet-500 to-blue-500 text-xs font-semibold text-white">
										{data.user.username.slice(0, 2).toUpperCase()}
									</AvatarFallback>
								</Avatar>
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium">{data.user.username}</p>
									<p class="truncate text-xs text-muted-foreground">
										{data.user.is_admin ? 'Администратор' : 'Пользователь'}
									</p>
								</div>
							</div>

							<DropdownMenu.Separator class="my-1" />

							<DropdownMenu.Item class="cursor-pointer gap-2">
								<User class="h-4 w-4 text-muted-foreground" />
								Профиль
							</DropdownMenu.Item>
							<DropdownMenu.Item class="cursor-pointer gap-2">
								<Settings class="h-4 w-4 text-muted-foreground" />
								Настройки
							</DropdownMenu.Item>

							<DropdownMenu.Separator class="my-1" />

							<form method="POST" action="/auth/logout">
								<DropdownMenu.Item asChild>
									<button
										type="submit"
										class="flex w-full cursor-pointer items-center gap-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
									>
										<LogOut class="h-4 w-4" />
										Выйти
									</button>
								</DropdownMenu.Item>
							</form>
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</div>
			</header>

			<!-- Content -->
			<main class="flex-1 p-6">
				{#key page.url.pathname}
					<div in:fade={{ duration: 150 }}>
						{@render children()}
					</div>
				{/key}
			</main>
		</div>
	</div>
{:else}
	<!-- Скелетон layout -->
	<div class="flex min-h-screen bg-background">
		<!-- Sidebar skeleton -->
		<aside class="hidden lg:flex w-64 flex-col border-r bg-card">
			<div class="flex h-16 items-center gap-3 border-b px-6">
				<Skeleton class="h-8 w-8 rounded-lg" />
				<div class="space-y-1.5">
					<Skeleton class="h-3 w-20" />
					<Skeleton class="h-2 w-14" />
				</div>
			</div>
			<div class="flex-1 space-y-6 p-3">
				{#each [4, 3, 2] as count}
					<div class="space-y-1.5">
						<Skeleton class="h-2 w-16 mx-3" />
						{#each Array(count) as _}
							<div class="flex items-center gap-3 px-3 py-2">
								<Skeleton class="h-4 w-4 rounded" />
								<Skeleton class="h-3 flex-1" />
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</aside>

		<!-- Main skeleton -->
		<div class="flex flex-1 flex-col lg:pl-64">
			<header class="sticky top-0 flex h-16 items-center justify-between border-b px-6">
				<Skeleton class="h-4 w-40" />
				<Skeleton class="h-8 w-8 rounded-full" />
			</header>
			<main class="flex-1 space-y-6 p-6">
				<div class="space-y-2">
					<Skeleton class="h-7 w-56" />
					<Skeleton class="h-4 w-72" />
				</div>
				<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{#each Array(6) as _}
						<Skeleton class="h-32 rounded-xl" />
					{/each}
				</div>
			</main>
		</div>
	</div>
{/if}