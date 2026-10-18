<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';
	import Badge from '#lib/components/Badge.svelte';
	import EvidenceTable from '#lib/components/EvidenceTable.svelte';
	import PolicyPanel from '#lib/components/PolicyPanel.svelte';
	import AnalysisPanel from '#lib/components/AnalysisPanel.svelte';
	import { STATUS_META, dateTime, money } from '#lib/format.ts';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state<string | null>(null);

	const c = $derived(data.case);
	const action = $derived(data.evaluation?.result.proposedAction ?? null);
	const approvable = $derived(data.approvalGates.slice(0, 5).every((g) => g.ok));

	const track =
		(name: string): SubmitFunction =>
		() => {
			busy = name;
			return async ({ update }) => {
				await update();
				busy = null;
			};
		};
	const btn =
		'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50';
</script>

<svelte:head><title>Review {c.id} · ProofFlow</title></svelte:head>

<nav class="mb-2 text-sm">
	<a href="/cases/{c.id}" class="text-blue-700 hover:underline">← Investigation workspace</a>
</nav>
<div class="mb-5 flex flex-wrap items-center gap-2">
	<h1 class="text-2xl font-semibold tracking-tight">Human review · {c.id}</h1>
	<Badge meta={STATUS_META[c.status]} />
</div>

<div aria-live="polite">
	{#if form?.error}
		<p role="alert" class="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
			{form.error}
		</p>
	{:else if form?.message}
		<p class="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{form.message}</p>
	{/if}
</div>

<div class="grid grid-cols-1 gap-6 xl:grid-cols-3">
	<div class="space-y-6 xl:col-span-2">
		<section class="rounded-lg border border-slate-200 bg-white p-4">
			<h2 class="text-sm font-semibold">
				Original complaint <span class="font-normal text-slate-500">(untrusted)</span>
			</h2>
			<p class="mt-2 rounded-md bg-slate-50 p-3 text-sm whitespace-pre-wrap">{c.complaint}</p>
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
			<h2 class="mb-3 text-sm font-semibold">Deterministic policy results and relevant clauses</h2>
			<PolicyPanel
				result={data.evaluation?.result ?? null}
				policy={data.policy}
				evaluatedAt={data.evaluation?.createdAt}
			/>
		</section>
		<section class="rounded-lg border border-slate-200 bg-white p-4">
			<h2 class="mb-3 text-sm font-semibold">AI analysis (advisory)</h2>
			<AnalysisPanel analysis={data.analysis} evidence={data.evidence} />
		</section>
	</div>

	<aside class="space-y-6 xl:sticky xl:top-4 xl:self-start">
		<section class="rounded-lg border-2 border-blue-200 bg-white p-4">
			<h2 class="text-sm font-semibold">Proposed action</h2>
			{#if action}
				<p class="mt-2 text-lg font-semibold">
					Simulated refund {money(action.amountCents, action.currency)}
				</p>
				<p class="text-sm text-slate-600">
					for duplicate charge <span class="font-mono">{action.transactionId}</span>
				</p>
			{:else}
				<p class="mt-2 text-sm text-slate-600">
					No refund is proposed. The deterministic policy did not establish eligibility.
				</p>
			{/if}

			<h3 class="mt-4 text-xs font-semibold tracking-wide text-slate-500 uppercase">
				Why it is {approvable ? 'permitted' : 'blocked'}
			</h3>
			<ul class="mt-2 space-y-2">
				{#each data.approvalGates as g (g.label)}
					<li class="flex gap-2 text-sm">
						{#if g.ok}
							<CircleCheck class="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Satisfied" />
						{:else}
							<CircleX class="mt-0.5 size-4 shrink-0 text-red-600" aria-label="Not satisfied" />
						{/if}
						<div>
							<div class="font-medium">{g.label}</div>
							<div class="text-xs break-words text-slate-500">{g.detail}</div>
						</div>
					</li>
				{/each}
			</ul>
			{#if data.user.role !== 'reviewer'}
				<p class="mt-3 rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-700">
					You are signed in as an analyst. Approval controls are enforced on the server; <a
						href="/settings#identity"
						class="font-medium text-blue-700 hover:underline">switch to the reviewer role</a
					> to decide.
				</p>
			{/if}
		</section>

		{#if data.approval}
			<section class="rounded-lg border border-slate-200 bg-white p-4 text-sm">
				<h2 class="font-semibold">Decision</h2>
				<p class="mt-1">
					<strong>{data.approval.decision}</strong> by {data.approval.reviewerName} ({data.approval
						.reviewerId})
				</p>
				<p class="text-slate-600">{dateTime(data.approval.createdAt)}</p>
				<p class="mt-1 text-slate-700">“{data.approval.reason}”</p>
			</section>
		{/if}

		{#if approvable}
			<form
				method="POST"
				action="?/approve"
				use:enhance={track('approve')}
				class="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
			>
				<h2 class="text-sm font-semibold">Approve</h2>
				<label class="block text-sm">
					<span class="font-medium">Reason</span>
					<textarea
						name="reason"
						required
						minlength="5"
						maxlength="500"
						rows="2"
						class="mt-1 w-full rounded-md border-slate-300 text-sm focus:border-blue-500 focus:ring-blue-500"
					></textarea>
				</label>
				<label class="flex items-start gap-2 text-sm">
					<input
						type="checkbox"
						name="confirm"
						value="yes"
						required
						class="mt-0.5 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
					/>
					I reviewed the records, policy results and AI analysis.
				</label>
				<button disabled={busy !== null} class="{btn} bg-blue-700 text-white hover:bg-blue-800">
					{#if busy === 'approve'}<LoaderCircle
							class="size-4 animate-spin"
							aria-hidden="true"
						/>{/if} Approve refund
				</button>
			</form>
		{/if}

		{#if data.canExecute}
			<form
				method="POST"
				action="?/execute"
				use:enhance={track('execute')}
				class="rounded-lg border border-slate-200 bg-white p-4"
			>
				<h2 class="text-sm font-semibold">Execute</h2>
				<p class="mt-1 text-xs text-slate-600">
					Records a <strong>simulated</strong> refund in the sandbox ledger after re-checking the policy.
					No real payment processor is called.
				</p>
				<button
					disabled={busy !== null}
					class="{btn} mt-3 bg-emerald-700 text-white hover:bg-emerald-800"
				>
					{#if busy === 'execute'}<LoaderCircle
							class="size-4 animate-spin"
							aria-hidden="true"
						/>{/if} Execute simulated refund
				</button>
			</form>
		{/if}

		{#if data.canReject}
			<form
				method="POST"
				action="?/reject"
				use:enhance={track('reject')}
				class="space-y-3 rounded-lg border border-slate-200 bg-white p-4"
			>
				<h2 class="text-sm font-semibold">Reject / close without action</h2>
				<label class="block text-sm">
					<span class="font-medium">Reason</span>
					<textarea
						name="reason"
						required
						minlength="5"
						maxlength="500"
						rows="2"
						class="mt-1 w-full rounded-md border-slate-300 text-sm focus:border-blue-500 focus:ring-blue-500"
					></textarea>
				</label>
				<button
					disabled={busy !== null}
					class="{btn} border border-red-300 bg-white text-red-800 hover:bg-red-50"
				>
					{#if busy === 'reject'}<LoaderCircle
							class="size-4 animate-spin"
							aria-hidden="true"
						/>{/if} Reject case
				</button>
			</form>
		{/if}

		{#each data.actions as a (a.id)}
			<section class="rounded-lg border border-slate-200 bg-white p-4 text-sm">
				<h2 class="font-semibold">Sandbox action <span class="font-mono text-xs">{a.id}</span></h2>
				<p class="mt-1 {a.status === 'SUCCEEDED' ? 'text-emerald-700' : 'text-red-700'}">
					{a.status} · {money(a.amountCents, a.currency)} for {a.transactionId}
				</p>
				<p class="text-xs text-slate-600">{String(a.result.message ?? '')}</p>
				<p class="text-xs text-slate-500">
					{dateTime(a.createdAt)} · by {a.actorId} · approval #{a.approvalId}
				</p>
			</section>
		{/each}
	</aside>
</div>
