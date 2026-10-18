<script lang="ts">
	import { dateTime } from '#lib/format.ts';
	import type { AnalysisRecord, EvidenceRef } from '#lib/server/db.ts';
	import AlertTriangle from '@lucide/svelte/icons/triangle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';

	let { analysis, evidence }: { analysis: AnalysisRecord | null; evidence: EvidenceRef[] } =
		$props();
	const aiRefs = $derived(evidence.filter((e) => e.source === 'AI'));
	const list = (title: string, items: string[]) => ({ title, items });
</script>

{#if !analysis}
	<p class="text-sm text-slate-500">
		No AI analysis yet. Running the investigation sends the complaint and records to the AMD-hosted
		model.
	</p>
{:else}
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
		<span>Model <span class="font-mono text-slate-700">{analysis.model ?? 'n/a'}</span></span>
		{#if analysis.latencyMs != null}<span>Latency {analysis.latencyMs} ms</span>{/if}
		{#if analysis.requestId}<span>Request <span class="font-mono">{analysis.requestId}</span></span
			>{/if}
		<span>{dateTime(analysis.createdAt)}</span>
	</div>

	{#if analysis.injectionSignals.length}
		<div
			class="mt-3 flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
			role="note"
		>
			<AlertTriangle class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
			<div>
				<strong>Possible prompt injection in the customer message:</strong>
				{analysis.injectionSignals.join(', ')}. Embedded instructions are treated as data and cannot
				authorize anything.
			</div>
		</div>
	{/if}

	{#if analysis.status !== 'OK'}
		<div
			class="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
			role="alert"
		>
			<strong
				>{analysis.status === 'ERROR' ? 'AMD inference failed' : 'Model output rejected'}</strong
			>
			({analysis.errorCategory}): {analysis.errorMessage}
			<p class="mt-1 text-xs">
				No fallback provider is used. The case cannot be approved until a valid analysis exists.
			</p>
		</div>
	{:else if analysis.output}
		{@const a = analysis.output}
		<p class="mt-3 text-sm text-slate-800">{a.summary}</p>
		<dl class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
			<div>
				<dt class="inline text-slate-500">Next step:</dt>
				<dd class="inline font-medium">{a.proposedNextStep.replaceAll('_', ' ').toLowerCase()}</dd>
			</div>
			<div>
				<dt class="inline text-slate-500">Confidence:</dt>
				<dd class="inline font-medium">{a.confidence.toLowerCase()}</dd>
			</div>
			<div>
				<dt class="inline text-slate-500">Model flagged injection:</dt>
				<dd class="inline font-medium">{a.injectionSuspected ? 'yes' : 'no'}</dd>
			</div>
		</dl>
		<p class="mt-1 text-xs text-slate-500">Uncertainty: {a.uncertainty}</p>

		<div class="mt-3 grid gap-3 sm:grid-cols-3">
			{#each [list('Identified issues', a.issues), list('Missing information', a.missingInformation), list('Conflicting evidence', a.conflictingEvidence)] as block (block.title)}
				<div>
					<h4 class="text-xs font-semibold tracking-wide text-slate-500 uppercase">
						{block.title}
					</h4>
					{#if block.items.length}
						<ul class="mt-1 list-disc space-y-1 pl-4 text-sm">
							{#each block.items as item, i (i)}<li>{item}</li>{/each}
						</ul>
					{:else}
						<p class="mt-1 text-sm text-slate-400">None reported</p>
					{/if}
				</div>
			{/each}
		</div>

		<h4 class="mt-4 text-xs font-semibold tracking-wide text-slate-500 uppercase">
			References cited by the model (verified against records)
		</h4>
		{#if aiRefs.length}
			<ul class="mt-1 space-y-1 text-sm">
				{#each aiRefs as r (r.id)}
					<li class="flex items-start gap-2">
						{#if r.valid}
							<CircleCheck class="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Verified" />
						{:else}
							<CircleX class="mt-0.5 size-4 shrink-0 text-red-600" aria-label="Unsupported" />
						{/if}
						<span
							><span class="font-mono text-xs font-semibold">{r.refId}</span>
							<span class="text-xs text-slate-500">({r.kind.toLowerCase()})</span>
							{r.note}</span
						>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="mt-1 text-sm text-slate-400">The model cited no references.</p>
		{/if}
	{/if}
{/if}
