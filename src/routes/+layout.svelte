<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import { page, navigating } from '$app/state';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import Inbox from '@lucide/svelte/icons/inbox';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import Settings from '@lucide/svelte/icons/settings';
	import Cpu from '@lucide/svelte/icons/cpu';
	import UserRound from '@lucide/svelte/icons/user-round';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();

	const nav = [
		{ href: '/', label: 'Overview', icon: LayoutDashboard },
		{ href: '/cases', label: 'Cases', icon: Inbox },
		{ href: '/approvals', label: 'Approvals', icon: ShieldCheck },
		{ href: '/audit', label: 'Audit trail', icon: ScrollText },
		{ href: '/settings', label: 'Settings', icon: Settings }
	];
	const active = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>ProofFlow</title>
</svelte:head>

<a
	href="#main"
	class="sr-only rounded bg-white px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
	>Skip to content</a
>

<div class="min-h-screen bg-slate-50 text-slate-900 lg:flex">
	<aside
		class="border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0"
	>
		<div class="flex items-center gap-2 px-4 py-4">
			<div
				class="grid size-8 place-items-center rounded-md bg-blue-700 text-sm font-bold text-white"
				aria-hidden="true"
			>
				P
			</div>
			<div>
				<div class="text-sm font-semibold">ProofFlow</div>
				<div class="text-xs text-slate-500">Evidence-driven refunds</div>
			</div>
		</div>
		<nav aria-label="Main" class="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:pb-0">
			{#each nav as item (item.href)}
				<a
					href={item.href}
					aria-current={active(item.href) ? 'page' : undefined}
					class="flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-600 {active(
						item.href
					)
						? 'bg-blue-50 text-blue-800'
						: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}"
				>
					<item.icon class="size-4" aria-hidden="true" />
					{item.label}
					{#if item.href === '/approvals' && data.pendingApprovals > 0}
						<span class="ml-auto rounded-full bg-violet-100 px-1.5 text-xs text-violet-800"
							>{data.pendingApprovals}</span
						>
					{/if}
				</a>
			{/each}
		</nav>
		<div class="hidden px-4 pt-6 text-xs text-slate-500 lg:block">
			<div class="flex items-center gap-1.5">
				<Cpu class="size-3.5" aria-hidden="true" />
				<span class="font-medium">AMD inference</span>
			</div>
			<div class="mt-1 flex items-center gap-1.5">
				<span
					class="size-2 rounded-full {data.amdConfigured ? 'bg-emerald-500' : 'bg-red-500'}"
					aria-hidden="true"
				></span>
				<span class="break-all">{data.amdConfigured ? data.model : 'Not configured'}</span>
			</div>
		</div>
	</aside>

	<div class="min-w-0 flex-1">
		<header
			class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-6"
		>
			<p class="text-xs text-amber-900">
				<span class="rounded bg-amber-100 px-1.5 py-0.5 font-semibold">DEMO</span>
				All customers, orders and payments are fictional. Refunds are simulated; no real payment processor
				is called.
			</p>
			<a
				href="/settings#identity"
				class="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-100"
			>
				<UserRound class="size-4" aria-hidden="true" />
				{data.user.name}
				<span class="rounded bg-slate-100 px-1.5 text-xs text-slate-600 capitalize"
					>{data.user.role}</span
				>
			</a>
		</header>
		{#if navigating.to}
			<div class="h-0.5 animate-pulse bg-blue-600" role="progressbar" aria-label="Loading"></div>
		{/if}
		<main id="main" class="mx-auto max-w-7xl px-4 py-6 sm:px-6">
			{@render children()}
		</main>
	</div>
</div>
