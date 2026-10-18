<script lang="ts">
	import Badge from '#lib/components/Badge.svelte';
	import { DECISION_META, STATUS_META, dateTime } from '#lib/format.ts';
	import { CASE_STATUSES } from '#lib/types.ts';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Cases · ProofFlow</title></svelte:head>

<div class="mb-4 flex flex-wrap items-end justify-between gap-3">
	<div>
		<h1 class="text-2xl font-semibold tracking-tight">Case inbox</h1>
		<p class="mt-1 text-sm text-slate-600">
			Duplicate-charge and refund complaints. Sample cases are fictional.
		</p>
	</div>
	<a
		href="/cases/new"
		class="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
	>
		<Plus class="size-4" aria-hidden="true" /> New case
	</a>
</div>

<form method="GET" class="mb-4 flex flex-wrap gap-2" data-sveltekit-keepfocus>
	<label class="relative min-w-60 flex-1">
		<span class="sr-only">Search cases</span>
		<Search
			class="pointer-events-none absolute top-2.5 left-2.5 size-4 text-slate-400"
			aria-hidden="true"
		/>
		<input
			name="q"
			value={data.search}
			placeholder="Search ID, subject, order, customer…"
			class="w-full rounded-md border-slate-300 pl-8 text-sm focus:border-blue-500 focus:ring-blue-500"
		/>
	</label>
	<label>
		<span class="sr-only">Status</span>
		<select
			name="status"
			class="rounded-md border-slate-300 text-sm focus:border-blue-500 focus:ring-blue-500"
			onchange={(e) => e.currentTarget.form?.requestSubmit()}
		>
			<option value="">All statuses</option>
			{#each CASE_STATUSES as s (s)}
				<option value={s} selected={data.status === s}>{STATUS_META[s].label}</option>
			{/each}
		</select>
	</label>
	<button
		class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
		>Filter</button
	>
	{#if data.search || data.status}
		<a href="/cases" class="px-2 py-2 text-sm text-blue-700 hover:underline">Clear</a>
	{/if}
</form>

<div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
	<table class="w-full text-left text-sm">
		<thead class="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase">
			<tr>
				<th scope="col" class="px-4 py-2.5 font-medium">Case</th>
				<th scope="col" class="px-4 py-2.5 font-medium">Subject</th>
				<th scope="col" class="px-4 py-2.5 font-medium">Customer</th>
				<th scope="col" class="px-4 py-2.5 font-medium">Status</th>
				<th scope="col" class="px-4 py-2.5 font-medium">Policy</th>
				<th scope="col" class="px-4 py-2.5 font-medium">Received</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-slate-100">
			{#each data.cases as c (c.id)}
				<tr class="hover:bg-slate-50">
					<td class="px-4 py-3 font-mono text-xs whitespace-nowrap">
						<a href="/cases/{c.id}" class="font-semibold text-blue-700 hover:underline">{c.id}</a>
					</td>
					<td class="px-4 py-3">
						<div class="font-medium">{c.subject}</div>
						<div class="text-xs text-slate-500">{c.scenario}</div>
					</td>
					<td class="px-4 py-3 whitespace-nowrap">{c.customerName}</td>
					<td class="px-4 py-3"><Badge meta={STATUS_META[c.status]} /></td>
					<td class="px-4 py-3">
						{#if c.decision}<Badge meta={DECISION_META[c.decision]} />{:else}<span
								class="text-xs text-slate-400">Not evaluated</span
							>{/if}
					</td>
					<td class="px-4 py-3 text-xs whitespace-nowrap text-slate-600"
						>{dateTime(c.receivedAt)}</td
					>
				</tr>
			{:else}
				<tr>
					<td colspan="6" class="px-4 py-10 text-center text-sm text-slate-500">
						{data.total === 0 ? 'No cases yet.' : 'No cases match these filters.'}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
<p class="mt-2 text-xs text-slate-500">Showing {data.cases.length} of {data.total} cases.</p>
