<script lang="ts">
	import { enhance } from '$app/forms';
	import Badge from '#lib/components/Badge.svelte';
	import AuditTimeline from '#lib/components/AuditTimeline.svelte';
	import EvidenceTable from '#lib/components/EvidenceTable.svelte';
	import PolicyPanel from '#lib/components/PolicyPanel.svelte';
	import AnalysisPanel from '#lib/components/AnalysisPanel.svelte';
	import { STATUS_META, dateTime } from '#lib/format.ts';
	import Cpu from '@lucide/svelte/icons/cpu';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let running = $state(false);

	const c = $derived(data.case);
	const canInvestigate = $derived(['NEW', 'NEEDS_REVIEW', 'AWAITING_APPROVAL'].includes(c.status));
</script>

<svelte:head><title>{c.id} · ProofFlow</title></svelte:head>

<nav class="mb-2 text-sm"><a href="/cases" class="text-blue-700 hover:underline">← Cases</a></nav>

<div class="mb-5 flex flex-wrap items-start justify-between gap-4">
	<div class="min-w-0">
		<div class="flex flex-wrap items-center gap-2">
			<span class="font-mono text-sm text-slate-500">{c.id}</span>
			<Badge meta={STATUS_META[c.status]} />
			<span class="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900"
				>Fictional · {c.scenario}</span
			>
		</div>
		<h1 class="mt-1 text-2xl font-semibold tracking-tight">{c.subject}</h1>
		<p class="text-sm text-slate-600">
			{data.customer?.name} · {data.customer?.emailMasked} · via {c.channel} · received {dateTime(
				c.receivedAt
			)}
		</p>
	</div>
	<div class="flex flex-wrap gap-2">
		<form
			method="POST"
			action="?/investigate"
			use:enhance={() => {
				running = true;
				return async ({ update }) => {
					await update();
					running = false;
				};
			}}
		>
			<button
				disabled={!canInvestigate || running}
				class="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{#if running}
					<LoaderCircle class="size-4 animate-spin" aria-hidden="true" /> Investigating with AMD…
				{:else}
					<Cpu class="size-4" aria-hidden="true" />
					{data.analysis ? 'Re-run investigation' : 'Run investigation'}
				{/if}
			</button>
		</form>
		<a
			href="/cases/{c.id}/review"
			class="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
		>
			<ShieldCheck class="size-4" aria-hidden="true" /> Review &amp; approval
		</a>
	</div>
</div>

<div aria-live="polite">
	{#if form?.error}
		<p role="alert" class="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
			{form.error}
		</p>
	{:else if form?.investigated}
		<p class="mb-4 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
			Investigation complete → <strong>{STATUS_META[form.investigated.status].label}</strong>. {form
				.investigated.reason}
		</p>
	{/if}
</div>

<div class="grid grid-cols-1 gap-6 xl:grid-cols-3">
	<div class="space-y-6 xl:col-span-2">
		<section class="rounded-lg border border-slate-200 bg-white p-4">
			<h2 class="text-sm font-semibold">
				Customer message <span class="font-normal text-slate-500"
					>(untrusted input, shown as plain text)</span
				>
			</h2>
			<p class="mt-2 rounded-md bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-800">
				{c.complaint}
			</p>
		</section>

		<section class="rounded-lg border border-slate-200 bg-white p-4">
			<h2 class="mb-3 text-sm font-semibold">Order and transaction records</h2>
			<EvidenceTable
				order={data.order}
				transactions={data.transactions}
				result={data.evaluation?.result ?? null}
			/>
		</section>

		<section class="rounded-lg border border-slate-200 bg-white p-4">
			<h2 class="mb-3 flex items-center gap-2 text-sm font-semibold">
				<Cpu class="size-4 text-blue-700" aria-hidden="true" /> AI analysis (AMD-hosted open model, advisory
				only)
			</h2>
			<AnalysisPanel analysis={data.analysis} evidence={data.evidence} />
		</section>

		<section class="rounded-lg border border-slate-200 bg-white p-4">
			<h2 class="mb-3 text-sm font-semibold">Deterministic policy validation</h2>
			<PolicyPanel
				result={data.evaluation?.result ?? null}
				policy={data.policy}
				evaluatedAt={data.evaluation?.createdAt}
			/>
		</section>
	</div>

	<aside class="space-y-6">
		<section class="rounded-lg border border-slate-200 bg-white p-4">
			<h2 class="text-sm font-semibold">Decision record</h2>
			{#if data.approval}
				<p class="mt-2 text-sm">
					<strong>{data.approval.decision}</strong> by {data.approval.reviewerName} on {dateTime(
						data.approval.createdAt
					)}
				</p>
				<p class="text-sm text-slate-600">“{data.approval.reason}”</p>
			{:else}
				<p class="mt-2 text-sm text-slate-500">No human decision recorded.</p>
			{/if}
			{#each data.actions as a (a.id)}
				<p class="mt-2 text-sm">
					<span class="font-mono text-xs">{a.id}</span>
					<span class={a.status === 'SUCCEEDED' ? 'text-emerald-700' : 'text-red-700'}
						>{a.status}</span
					> (simulated)
				</p>
			{/each}
		</section>
		<section class="rounded-lg border border-slate-200 bg-white p-4">
			<h2 class="mb-3 text-sm font-semibold">Audit history</h2>
			<AuditTimeline events={data.audit} />
		</section>
	</aside>
</div>
