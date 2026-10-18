<script lang="ts">
	import Badge from '#lib/components/Badge.svelte';
	import AuditTimeline from '#lib/components/AuditTimeline.svelte';
	import { STATUS_META, dateTime, money } from '#lib/format.ts';
	import { CASE_STATUSES } from '#lib/types.ts';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const queue = $derived(
		data.cases.filter((c) =>
			['NEW', 'NEEDS_REVIEW', 'AWAITING_APPROVAL', 'APPROVED', 'ACTION_FAILED'].includes(c.status)
		)
	);
	const tiles = $derived([
		{ label: 'Open cases', value: queue.length, hint: `${data.cases.length} total` },
		{ label: 'Simulated refunds', value: data.refunds.n, hint: money(data.refunds.cents ?? 0) },
		{ label: 'Unsafe actions blocked', value: data.blocked, hint: 'Denied or blocked attempts' },
		{
			label: 'AMD analyses',
			value: `${data.ai.ok ?? 0} ok / ${data.ai.failed ?? 0} failed`,
			hint: data.ai.avgLatency
				? `avg ${Math.round(data.ai.avgLatency)} ms · ${data.ai.unsupported ?? 0} with unsupported refs`
				: 'No live analyses yet'
		}
	]);
</script>

<svelte:head><title>Overview · ProofFlow</title></svelte:head>

<div class="mb-6">
	<h1 class="text-2xl font-semibold tracking-tight">Overview</h1>
	<p class="mt-1 max-w-3xl text-sm text-slate-600">
		No evidence, no claim. No policy validation, no approval. No human authorization, no financial
		action.
	</p>
</div>

<section aria-label="Key figures" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
	{#each tiles as t (t.label)}
		<div class="rounded-lg border border-slate-200 bg-white p-4">
			<div class="text-xs font-medium tracking-wide text-slate-500 uppercase">{t.label}</div>
			<div class="mt-1 text-2xl font-semibold tabular-nums">{t.value}</div>
			<div class="mt-0.5 text-xs text-slate-500">{t.hint}</div>
		</div>
	{/each}
</section>

<section aria-label="Cases by status" class="mt-4 flex flex-wrap gap-2">
	{#each CASE_STATUSES as s (s)}
		<a
			href="/cases?status={s}"
			class="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm hover:border-blue-300"
		>
			<Badge meta={STATUS_META[s]} />
			<span class="tabular-nums">{data.cases.filter((c) => c.status === s).length}</span>
		</a>
	{/each}
</section>

<div class="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
	<section class="rounded-lg border border-slate-200 bg-white lg:col-span-2">
		<div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
			<h2 class="text-sm font-semibold">Work queue</h2>
			<a href="/cases" class="text-sm font-medium text-blue-700 hover:underline">All cases</a>
		</div>
		{#if queue.length === 0}
			<p class="px-4 py-8 text-center text-sm text-slate-500">
				Nothing waiting. All cases are resolved.
			</p>
		{:else}
			<ul class="divide-y divide-slate-100">
				{#each queue as c (c.id)}
					<li>
						<a href="/cases/{c.id}" class="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<span class="font-mono text-xs text-slate-500">{c.id}</span>
									<Badge meta={STATUS_META[c.status]} />
								</div>
								<div class="truncate text-sm font-medium">{c.subject}</div>
								<div class="text-xs text-slate-500">
									{c.scenario} · received {dateTime(c.receivedAt)}
								</div>
							</div>
							<ArrowRight class="size-4 shrink-0 text-slate-400" aria-hidden="true" />
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="rounded-lg border border-slate-200 bg-white">
		<div class="flex items-center justify-between border-b border-slate-200 px-4 py-3">
			<h2 class="text-sm font-semibold">Recent activity</h2>
			<a href="/audit" class="text-sm font-medium text-blue-700 hover:underline">Audit trail</a>
		</div>
		<div class="p-4">
			<AuditTimeline events={data.recent} showCase />
		</div>
	</section>
</div>
