<script lang="ts">
	import Badge from './Badge.svelte';
	import { DECISION_META, OUTCOME_META, dateTime, money } from '#lib/format.ts';
	import type { Policy, PolicyResult } from '#lib/types.ts';

	let {
		result,
		policy,
		evaluatedAt
	}: { result: PolicyResult | null; policy: Policy; evaluatedAt?: string } = $props();
	const clause = (id: string) => policy.clauses.find((c) => c.id === id);
</script>

{#if !result}
	<p class="text-sm text-slate-500">
		Not evaluated yet. Run the investigation to apply the policy rules.
	</p>
{:else}
	<div class="flex flex-wrap items-center gap-2">
		<Badge meta={DECISION_META[result.decision]} />
		<span class="text-xs text-slate-500"
			>{policy.name} v{result.policyVersion}{evaluatedAt ? ` · ${dateTime(evaluatedAt)}` : ''}</span
		>
	</div>
	{#if result.proposedAction}
		<p class="mt-2 text-sm">
			Proposed: <strong
				>simulated refund of {money(
					result.proposedAction.amountCents,
					result.proposedAction.currency
				)}</strong
			>
			for <span class="font-mono">{result.proposedAction.transactionId}</span>
		</p>
	{/if}

	<ul class="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200">
		{#each result.rules as r (r.clauseId)}
			<li class="flex gap-3 px-3 py-2">
				<div class="w-24 shrink-0"><Badge meta={OUTCOME_META[r.outcome]} /></div>
				<div class="min-w-0 text-sm">
					<div>
						<span class="font-mono text-xs font-semibold">{r.clauseId}</span>
						<span class="font-medium">{clause(r.clauseId)?.title}</span>
					</div>
					<p class="text-slate-700">{r.detail}</p>
					{#if r.refs.length}
						<p class="mt-0.5 font-mono text-xs text-slate-500">Evidence: {r.refs.join(', ')}</p>
					{/if}
					{#if clause(r.clauseId)}
						<details class="mt-1 text-xs text-slate-500">
							<summary class="cursor-pointer">Policy text</summary>
							<p class="mt-1">{clause(r.clauseId)?.text}</p>
						</details>
					{/if}
				</div>
			</li>
		{/each}
	</ul>

	{#if result.facts.length}
		<div class="mt-4 grid gap-3 sm:grid-cols-2">
			{#each [['CONFIRMED', 'Confirmed facts'], ['SUSPECTED', 'Suspected, not confirmed']] as [kind, title] (kind)}
				{@const facts = result.facts.filter((f) => f.kind === kind)}
				<div>
					<h4 class="text-xs font-semibold tracking-wide text-slate-500 uppercase">{title}</h4>
					{#if facts.length}
						<ul class="mt-1 list-disc space-y-1 pl-4 text-sm">
							{#each facts as f, i (i)}<li>{f.text}</li>{/each}
						</ul>
					{:else}
						<p class="mt-1 text-sm text-slate-400">None</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
{/if}
