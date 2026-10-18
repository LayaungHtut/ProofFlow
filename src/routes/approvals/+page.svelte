<script lang="ts">
	import Badge from '#lib/components/Badge.svelte';
	import { STATUS_META, dateTime, money } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Approvals · ProofFlow</title></svelte:head>

<h1 class="text-2xl font-semibold tracking-tight">Approval queue</h1>
<p class="mt-1 mb-4 text-sm text-slate-600">
	Cases that passed deterministic checks and need a reviewer's decision or execution.
</p>

{#if data.rows.length === 0}
	<div
		class="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500"
	>
		Nothing to approve. Run an investigation on a case to route it here.
	</div>
{:else}
	<ul class="space-y-3">
		{#each data.rows as r (r.id)}
			<li class="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-white p-4">
				<div class="min-w-0 flex-1">
					<div class="flex flex-wrap items-center gap-2">
						<span class="font-mono text-xs text-slate-500">{r.id}</span>
						<Badge meta={STATUS_META[r.status]} />
					</div>
					<div class="font-medium">{r.subject}</div>
					<div class="text-xs text-slate-500">
						{r.approval
							? `Approved by ${r.approval.reviewerName}, ${dateTime(r.approval.createdAt)}`
							: `Received ${dateTime(r.receivedAt)}`}
					</div>
				</div>
				{#if r.action}
					<div class="text-right">
						<div class="text-lg font-semibold tabular-nums">
							{money(r.action.amountCents, r.action.currency)}
						</div>
						<div class="font-mono text-xs text-slate-500">{r.action.transactionId}</div>
					</div>
				{/if}
				<a
					href="/cases/{r.id}/review"
					class="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white hover:bg-blue-800"
				>
					{r.status === 'AWAITING_APPROVAL' ? 'Review' : 'Execute'}
				</a>
			</li>
		{/each}
	</ul>
{/if}
