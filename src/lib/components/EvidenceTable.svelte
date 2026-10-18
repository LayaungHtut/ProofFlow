<script lang="ts">
	import { dateTime, money } from '#lib/format.ts';
	import type { Order, PolicyResult, Transaction } from '#lib/types.ts';

	let {
		order,
		transactions,
		result
	}: { order: Order | null; transactions: Transaction[]; result: PolicyResult | null } = $props();

	const dupIds = $derived(new Set(result?.duplicateCandidates.map((d) => d.duplicateId) ?? []));
	const statusCls: Record<string, string> = {
		SUCCEEDED: 'text-emerald-700',
		PENDING: 'text-amber-700',
		FAILED: 'text-red-700',
		REVERSED: 'text-slate-500'
	};
</script>

{#if order}
	<dl class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
		<div>
			<dt class="text-xs text-slate-500">Order</dt>
			<dd class="font-mono font-medium">{order.id}</dd>
		</div>
		<div>
			<dt class="text-xs text-slate-500">Total</dt>
			<dd class="font-medium tabular-nums">{money(order.totalCents, order.currency)}</dd>
		</div>
		<div>
			<dt class="text-xs text-slate-500">Placed</dt>
			<dd>{dateTime(order.placedAt)}</dd>
		</div>
		<div>
			<dt class="text-xs text-slate-500">Item</dt>
			<dd>{order.description}</dd>
		</div>
	</dl>
{:else}
	<p class="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
		No order record is linked to this complaint.
	</p>
{/if}

<div class="mt-4 overflow-x-auto">
	<table class="w-full text-left text-sm">
		<caption class="sr-only">Transactions on file for this customer</caption>
		<thead class="text-xs text-slate-500 uppercase">
			<tr class="border-b border-slate-200">
				<th scope="col" class="py-2 pr-3 font-medium">Transaction</th>
				<th scope="col" class="py-2 pr-3 font-medium">Kind</th>
				<th scope="col" class="py-2 pr-3 text-right font-medium">Amount</th>
				<th scope="col" class="py-2 pr-3 font-medium">Status</th>
				<th scope="col" class="py-2 pr-3 font-medium">Order</th>
				<th scope="col" class="py-2 pr-3 font-medium">Processor ref</th>
				<th scope="col" class="py-2 font-medium">Time</th>
			</tr>
		</thead>
		<tbody class="divide-y divide-slate-100">
			{#each transactions as t (t.id)}
				<tr class={dupIds.has(t.id) ? 'bg-violet-50' : ''}>
					<td class="py-2 pr-3 font-mono text-xs font-semibold whitespace-nowrap">
						{t.id}
						{#if dupIds.has(t.id)}<span
								class="ml-1 rounded bg-violet-200 px-1 text-[10px] text-violet-900">duplicate</span
							>{/if}
						{#if t.sandbox}<span
								class="ml-1 rounded bg-emerald-100 px-1 text-[10px] text-emerald-900">sandbox</span
							>{/if}
					</td>
					<td class="py-2 pr-3 text-xs">{t.kind}{t.refundOf ? ` of ${t.refundOf}` : ''}</td>
					<td class="py-2 pr-3 text-right tabular-nums">{money(t.amountCents, t.currency)}</td>
					<td class="py-2 pr-3 text-xs font-medium {statusCls[t.status]}">{t.status}</td>
					<td class="py-2 pr-3 font-mono text-xs">{t.orderId ?? 'unlinked'}</td>
					<td class="py-2 pr-3 font-mono text-xs text-slate-500">{t.processorRef}</td>
					<td class="py-2 text-xs whitespace-nowrap text-slate-600">{dateTime(t.createdAt)}</td>
				</tr>
			{:else}
				<tr
					><td colspan="7" class="py-4 text-center text-sm text-slate-500"
						>No transactions on file.</td
					></tr
				>
			{/each}
		</tbody>
	</table>
</div>
