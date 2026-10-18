<script lang="ts">
	import { dateTime } from '#lib/format.ts';
	import type { AuditEvent } from '#lib/server/db.ts';

	let { events, showCase = false }: { events: AuditEvent[]; showCase?: boolean } = $props();

	const danger = new Set([
		'AUTHORIZATION_DENIED',
		'ACTION_BLOCKED',
		'AI_ANALYSIS_FAILED',
		'SANDBOX_REFUND_FAILED',
		'INVESTIGATION_ERROR'
	]);
	const good = new Set([
		'APPROVED',
		'SANDBOX_REFUND_SUCCEEDED',
		'AI_ANALYSIS_COMPLETED',
		'AMD_CONNECTION_OK'
	]);

	function summarize(d: Record<string, unknown>) {
		const parts: string[] = [];
		for (const k of [
			'reason',
			'decision',
			'status',
			'errorCategory',
			'latencyMs',
			'requestId',
			'actionId',
			'op',
			'message',
			'model'
		]) {
			if (d[k] != null && d[k] !== '')
				parts.push(`${k}: ${typeof d[k] === 'object' ? JSON.stringify(d[k]) : d[k]}`);
		}
		const unsupported = d.unsupportedRefs as string[] | undefined;
		if (unsupported?.length) parts.push(`unsupported refs: ${unsupported.join(', ')}`);
		const signals = d.injectionSignals as string[] | undefined;
		if (signals?.length) parts.push(`injection signals: ${signals.join(', ')}`);
		return parts.join(' · ');
	}
</script>

{#if events.length === 0}
	<p class="text-sm text-slate-500">No audit events yet.</p>
{:else}
	<ol class="relative space-y-3 border-l border-slate-200 pl-5">
		{#each events as e (e.id)}
			<li class="relative">
				<span
					class="absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-white {danger.has(
						e.type
					)
						? 'bg-red-500'
						: good.has(e.type)
							? 'bg-emerald-500'
							: 'bg-blue-500'}"
					aria-hidden="true"
				></span>
				<div class="flex flex-wrap items-baseline gap-x-2 text-sm">
					<span class="font-mono text-xs font-semibold text-slate-900">{e.type}</span>
					{#if e.fromStatus || e.toStatus}
						<span class="text-xs text-slate-500">{e.fromStatus ?? '—'} → {e.toStatus ?? '—'}</span>
					{/if}
					{#if showCase && e.caseId}
						<a class="text-xs font-medium text-blue-700 hover:underline" href="/cases/{e.caseId}"
							>{e.caseId}</a
						>
					{/if}
				</div>
				<div class="text-xs text-slate-500">
					{dateTime(e.at)} · <span class="font-mono">{e.actor}</span>
				</div>
				{#if summarize(e.detail)}
					<p class="mt-0.5 text-xs break-words text-slate-600">{summarize(e.detail)}</p>
				{/if}
			</li>
		{/each}
	</ol>
{/if}
