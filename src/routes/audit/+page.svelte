<script lang="ts">
	import { dateTime } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const danger = new Set([
		'AUTHORIZATION_DENIED',
		'ACTION_BLOCKED',
		'AI_ANALYSIS_FAILED',
		'SANDBOX_REFUND_FAILED',
		'AMD_CONNECTION_FAILED',
		'INVESTIGATION_ERROR'
	]);
</script>

<svelte:head><title>Audit trail · ProofFlow</title></svelte:head>

<h1 class="text-2xl font-semibold tracking-tight">Audit trail</h1>
<p class="mt-1 mb-4 text-sm text-slate-600">
	Append-only record of every state transition, model call, approval, refused attempt and sandbox
	action.
</p>

<form method="GET" class="mb-4 flex flex-wrap gap-2">
	<label>
		<span class="sr-only">Event type</span>
		<select
			name="type"
			class="rounded-md border-slate-300 text-sm"
			onchange={(e) => e.currentTarget.form?.requestSubmit()}
		>
			<option value="">All event types</option>
			{#each data.types as t (t)}<option value={t} selected={data.type === t}>{t}</option>{/each}
		</select>
	</label>
	<label>
		<span class="sr-only">Case ID</span>
		<input
			name="case"
			value={data.caseId}
			placeholder="Case ID"
			class="w-36 rounded-md border-slate-300 text-sm"
		/>
	</label>
	<button
		class="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
		>Filter</button
	>
	{#if data.type || data.caseId}<a
			href="/audit"
			class="px-2 py-2 text-sm text-blue-700 hover:underline">Clear</a
		>{/if}
</form>

<div class="overflow-x-auto rounded-lg border border-slate-200 bg-white">
	<table class="w-full text-left text-sm">
		<thead class="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 uppercase">
			<tr>
				<th scope="col" class="px-3 py-2 font-medium">#</th>
				<th scope="col" class="px-3 py-2 font-medium">Time</th>
				<th scope="col" class="px-3 py-2 font-medium">Event</th>
				<th scope="col" class="px-3 py-2 font-medium">Case</th>
				<th scope="col" class="px-3 py-2 font-medium">Actor</th>
				<th scope="col" class="px-3 py-2 font-medium">Transition</th>
				<th scope="col" class="px-3 py-2 font-medium">Detail</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-slate-100 align-top">
			{#each data.events as e (e.id)}
				<tr>
					<td class="px-3 py-2 text-xs text-slate-400 tabular-nums">{e.id}</td>
					<td class="px-3 py-2 text-xs whitespace-nowrap">{dateTime(e.at)}</td>
					<td
						class="px-3 py-2 font-mono text-xs font-semibold {danger.has(e.type)
							? 'text-red-700'
							: ''}">{e.type}</td
					>
					<td class="px-3 py-2 font-mono text-xs">
						{#if e.caseId}<a href="/cases/{e.caseId}" class="text-blue-700 hover:underline"
								>{e.caseId}</a
							>{:else}—{/if}
					</td>
					<td class="px-3 py-2 font-mono text-xs">{e.actor}</td>
					<td class="px-3 py-2 text-xs whitespace-nowrap"
						>{e.fromStatus || e.toStatus ? `${e.fromStatus ?? '—'} → ${e.toStatus ?? '—'}` : ''}</td
					>
					<td class="max-w-md px-3 py-2">
						{#if Object.keys(e.detail).length}
							<details>
								<summary class="cursor-pointer text-xs text-slate-600">View</summary>
								<pre
									class="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-[11px]">{JSON.stringify(
										e.detail,
										null,
										2
									)}</pre>
							</details>
						{/if}
					</td>
				</tr>
			{:else}
				<tr><td colspan="7" class="px-3 py-10 text-center text-slate-500">No events match.</td></tr>
			{/each}
		</tbody>
	</table>
</div>
