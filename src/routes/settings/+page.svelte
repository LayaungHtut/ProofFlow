<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '$app/forms';
	import { dateTime } from '#lib/format.ts';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import CircleX from '@lucide/svelte/icons/circle-x';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import PlugZap from '@lucide/svelte/icons/plug-zap';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state<string | null>(null);
	let role = $derived(data.user.role);

	const track =
		(name: string): SubmitFunction =>
		() => {
			busy = name;
			return async ({ update }) => {
				await update({ reset: false });
				busy = null;
			};
		};
	const panel = 'rounded-lg border border-slate-200 bg-white p-5';
	const btn =
		'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50';
</script>

<svelte:head><title>Settings · ProofFlow</title></svelte:head>

<h1 class="mb-6 text-2xl font-semibold tracking-tight">Settings</h1>

<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
	<section class={panel} aria-labelledby="amd-h">
		<h2 id="amd-h" class="text-base font-semibold">AMD inference connection</h2>
		<p class="mt-1 text-sm text-slate-600">
			Server-side only. The API key never reaches the browser.
		</p>
		<dl class="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
			<dt class="text-slate-500">Status</dt>
			<dd class="flex items-center gap-1.5 font-medium">
				<span
					class="size-2 rounded-full {data.amd.configured ? 'bg-emerald-500' : 'bg-red-500'}"
					aria-hidden="true"
				></span>
				{data.amd.configured ? 'Configured' : 'Not configured'}
			</dd>
			<dt class="text-slate-500">Endpoint</dt>
			<dd class="font-mono text-xs break-all">{data.amd.endpoint ?? 'AMD_BASE_URL not set'}</dd>
			<dt class="text-slate-500">Model</dt>
			<dd class="font-mono text-xs break-all">{data.amd.model ?? 'AMD_MODEL not set'}</dd>
			<dt class="text-slate-500">API key</dt>
			<dd>{data.amd.keyPresent ? 'Present (hidden)' : 'AMD_API_KEY not set'}</dd>
			<dt class="text-slate-500">Timeout</dt>
			<dd>{data.amd.timeoutMs} ms per attempt, up to 2 retries for transient errors</dd>
		</dl>

		<form method="POST" action="?/test" use:enhance={track('test')} class="mt-4">
			<button disabled={busy !== null} class="{btn} bg-blue-700 text-white hover:bg-blue-800">
				{#if busy === 'test'}<LoaderCircle class="size-4 animate-spin" aria-hidden="true" /> Testing…{:else}<PlugZap
						class="size-4"
						aria-hidden="true"
					/> Test live connection{/if}
			</button>
		</form>

		<div aria-live="polite">
			{#if form?.report}
				{@const r = form.report}
				<div
					class="mt-4 rounded-md border px-3 py-2 text-sm {r.ok
						? 'border-emerald-200 bg-emerald-50 text-emerald-900'
						: 'border-red-200 bg-red-50 text-red-900'}"
				>
					<div class="flex items-center gap-1.5 font-medium">
						{#if r.ok}<CircleCheck class="size-4" aria-hidden="true" />{:else}<CircleX
								class="size-4"
								aria-hidden="true"
							/>{/if}
						{r.message}
					</div>
					<div class="mt-1 text-xs">
						{#if r.latencyMs != null}Latency {r.latencyMs} ms ·
						{/if}
						{#if r.errorCategory}Category {r.errorCategory} ·
						{/if}
						Model listed by /models: {r.modelListed === null
							? 'unknown'
							: r.modelListed
								? 'yes'
								: 'no'}
						{#if r.requestId}
							· Request {r.requestId}{/if}
					</div>
				</div>
			{/if}
		</div>

		<h3 class="mt-6 text-xs font-semibold tracking-wide text-slate-500 uppercase">
			Recent connection tests
		</h3>
		{#if data.checks.length}
			<ul class="mt-2 divide-y divide-slate-100 text-sm">
				{#each data.checks as c (c.id)}
					<li class="flex flex-wrap justify-between gap-2 py-1.5">
						<span class={c.type === 'AMD_CONNECTION_OK' ? 'text-emerald-700' : 'text-red-700'}>
							{c.type === 'AMD_CONNECTION_OK' ? 'Success' : `Failed (${c.detail.errorCategory})`}
							{#if c.detail.latencyMs}· {c.detail.latencyMs} ms{/if}
						</span>
						<span class="text-xs text-slate-500">{dateTime(c.at)}</span>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="mt-2 text-sm text-slate-500">No tests run yet.</p>
		{/if}
	</section>

	<div class="space-y-6">
		<section id="identity" class={panel} aria-labelledby="id-h">
			<h2 id="id-h" class="text-base font-semibold">Demo identity</h2>
			<p class="mt-1 text-sm text-slate-600">
				Analysts investigate; only reviewers can approve, reject or execute. Roles are enforced on
				the server. This demo has no real login.
			</p>
			<form method="POST" action="?/role" use:enhance={track('role')} class="mt-4 space-y-3">
				<fieldset class="flex flex-wrap gap-4 text-sm">
					<legend class="sr-only">Role</legend>
					<label class="flex items-center gap-2"
						><input
							type="radio"
							name="role"
							value="analyst"
							bind:group={role}
							class="text-blue-700"
						/> Alex Analyst (analyst)</label
					>
					<label class="flex items-center gap-2"
						><input
							type="radio"
							name="role"
							value="reviewer"
							bind:group={role}
							class="text-blue-700"
						/> Riley Reviewer (reviewer)</label
					>
				</fieldset>
				{#if data.reviewerCodeRequired && role === 'reviewer'}
					<label class="block text-sm">
						<span class="font-medium">Reviewer access code</span>
						<input
							type="password"
							name="code"
							autocomplete="off"
							class="mt-1 w-full max-w-xs rounded-md border-slate-300 text-sm"
						/>
					</label>
				{/if}
				<button
					disabled={busy !== null}
					class="{btn} border border-slate-300 bg-white hover:bg-slate-50">Switch role</button
				>
				{#if form?.roleError}<p role="alert" class="text-sm text-red-700">{form.roleError}</p>{/if}
				{#if form?.roleMessage}<p class="text-sm text-emerald-700">{form.roleMessage}</p>{/if}
			</form>
		</section>

		<section class={panel} aria-labelledby="demo-h">
			<h2 id="demo-h" class="text-base font-semibold">Demo data</h2>
			<p class="mt-1 text-sm text-slate-600">
				Restores the six fictional scenarios and clears all analyses, decisions, sandbox actions and
				audit events.
				{data.demoMode ? '' : 'Disabled: set DEMO_MODE=true to enable.'}
			</p>
			<form
				method="POST"
				action="?/reset"
				use:enhance={(e) => {
					if (!confirm('Reset all demo data? This clears every decision and audit event.'))
						return e.cancel();
					return track('reset')(e);
				}}
				class="mt-4"
			>
				<button
					disabled={!data.demoMode || busy !== null}
					class="{btn} border border-red-300 bg-white text-red-800 hover:bg-red-50"
				>
					<RotateCcw class="size-4" aria-hidden="true" /> Reset demo data
				</button>
				{#if form?.resetError}<p role="alert" class="mt-2 text-sm text-red-700">
						{form.resetError}
					</p>{/if}
				{#if form?.resetMessage}<p class="mt-2 text-sm text-emerald-700">
						{form.resetMessage}
					</p>{/if}
			</form>
		</section>
	</div>
</div>
