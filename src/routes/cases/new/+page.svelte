<script lang="ts">
	import { enhance } from '$app/forms';
	import { money } from '#lib/format.ts';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let submitting = $state(false);
	const values = $derived((form as { values?: Record<string, string> } | null)?.values ?? {});
</script>

<svelte:head><title>New case · ProofFlow</title></svelte:head>

<nav class="mb-2 text-sm"><a href="/cases" class="text-blue-700 hover:underline">← Cases</a></nav>
<h1 class="text-2xl font-semibold tracking-tight">New complaint case</h1>
<p class="mt-1 max-w-2xl text-sm text-slate-600">
	Attach a complaint to one of the fictional demo orders. The text is treated as untrusted input:
	try including instructions aimed at the AI and watch them get flagged and ignored.
</p>

<form
	method="POST"
	class="mt-6 max-w-2xl space-y-4 rounded-lg border border-slate-200 bg-white p-5"
	use:enhance={() => {
		submitting = true;
		return async ({ update }) => {
			await update();
			submitting = false;
		};
	}}
>
	{#if form?.error}
		<p role="alert" class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{form.error}</p>
	{/if}
	<label class="block">
		<span class="text-sm font-medium">Order</span>
		<select
			name="orderId"
			required
			class="mt-1 w-full rounded-md border-slate-300 text-sm focus:border-blue-500 focus:ring-blue-500"
		>
			<option value="">Select an order…</option>
			{#each data.orders as o (o.id)}
				<option value={o.id} selected={values.orderId === o.id}
					>{o.id} · {o.description} · {money(o.totalCents, o.currency)} · {o.customer}</option
				>
			{/each}
		</select>
	</label>
	<label class="block">
		<span class="text-sm font-medium">Subject</span>
		<input
			name="subject"
			required
			maxlength="120"
			value={values.subject ?? ''}
			class="mt-1 w-full rounded-md border-slate-300 text-sm focus:border-blue-500 focus:ring-blue-500"
		/>
	</label>
	<label class="block">
		<span class="text-sm font-medium">Customer message</span>
		<textarea
			name="complaint"
			required
			maxlength="4000"
			rows="7"
			class="mt-1 w-full rounded-md border-slate-300 text-sm focus:border-blue-500 focus:ring-blue-500"
			>{values.complaint ?? ''}</textarea
		>
		<span class="text-xs text-slate-500"
			>Max 4,000 characters. Do not enter real personal or payment data.</span
		>
	</label>
	<button
		disabled={submitting}
		class="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
	>
		{submitting ? 'Creating…' : 'Create case'}
	</button>
</form>
