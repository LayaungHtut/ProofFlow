// Repeatable evaluation: `npm run eval` (offline only) or `npm run eval -- --live [--runs N]`.
// Offline: deterministic policy agreement + guard enforcement. No model calls, no network.
// Live: real requests to the configured AMD endpoint for every seeded scenario.
// Writes reports/eval-latest.json. Never records credentials or complaint text.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { isConfigured } from '#lib/server/amd.ts';
import {
	approve,
	executeRefund,
	investigate,
	reject,
	DomainError,
	type Ctx
} from '#lib/server/cases.ts';
import { openDb, q } from '#lib/server/db.ts';
import { evaluatePolicy } from '#lib/server/policy.ts';
import { SCENARIOS, seed } from '#lib/server/seed.ts';
import type { User } from '#lib/types.ts';

if (existsSync('.env')) process.loadEnvFile('.env');
const args = process.argv.slice(2);
const live = args.includes('--live');
const runs = Math.max(1, Number(args[args.indexOf('--runs') + 1]) || 1);

const analyst: User = { id: 'eval-analyst', name: 'Eval Analyst', role: 'analyst' };
const reviewer: User = { id: 'eval-reviewer', name: 'Eval Reviewer', role: 'reviewer' };
const amd = {
	baseUrl: process.env.AMD_BASE_URL,
	apiKey: process.env.AMD_API_KEY,
	model: process.env.AMD_MODEL,
	timeoutMs: Number(process.env.AMD_TIMEOUT_MS) || 45_000
};
const freshDb = () => {
	const db = openDb(':memory:');
	seed(db);
	return db;
};

// ---- Offline 1: policy agreement with predefined expected outcomes
const policyRows = SCENARIOS.map((sc) => {
	const db = freshDb();
	const c = q.case(db, sc.caseId)!;
	const r = evaluatePolicy({
		caseRow: c,
		order: q.order(db, c.orderId),
		transactions: q.customerTransactions(db, c.customerId),
		policy: q.policy(db)
	});
	return {
		caseId: sc.caseId,
		label: sc.label,
		expected: sc.expected,
		actual: r.decision,
		agree: r.decision === sc.expected
	};
});

// ---- Offline 2: invalid action attempts must all be blocked.
// Cases are moved to AWAITING_APPROVAL with a schema-valid stub analysis so the guards can be exercised
// without any model; this measures the guards, not the model.
const stubFetch: typeof fetch = async () =>
	new Response(
		JSON.stringify({
			model: 'offline-stub',
			choices: [
				{
					message: {
						content: JSON.stringify({
							summary: 'stub',
							issues: [],
							candidateTransactionIds: [],
							evidenceRefs: [],
							missingInformation: [],
							conflictingEvidence: [],
							proposedNextStep: 'ESCALATE',
							confidence: 'LOW',
							uncertainty: 'offline stub',
							requiresHumanReview: true,
							injectionSuspected: false
						})
					}
				}
			]
		})
	);
const offlineCtx = (): Ctx => ({
	db: freshDb(),
	amd: { baseUrl: 'http://offline.invalid/v1', apiKey: 'x', model: 'offline-stub', maxRetries: 0 },
	fetch: stubFetch
});

async function attempt(name: string, fn: () => unknown) {
	try {
		await fn();
		return { name, blocked: false, reason: 'ALLOWED' };
	} catch (e) {
		if (e instanceof DomainError) return { name, blocked: true, reason: `${e.code}: ${e.message}` };
		throw e;
	}
}
const guardRows: Awaited<ReturnType<typeof attempt>>[] = [];
{
	const ctx = offlineCtx();
	for (const sc of SCENARIOS) await investigate(ctx, sc.caseId, analyst);
	guardRows.push(
		await attempt('Analyst approves eligible case A', () => approve(ctx, 'CASE-1001', analyst, 'x'))
	);
	guardRows.push(
		await attempt('Analyst executes refund for case A', () =>
			executeRefund(ctx, 'CASE-1001', analyst)
		)
	);
	guardRows.push(
		await attempt('Reviewer executes case A before approval', () =>
			executeRefund(ctx, 'CASE-1001', reviewer)
		)
	);
	for (const id of ['CASE-1002', 'CASE-1003', 'CASE-1004', 'CASE-1005', 'CASE-1006']) {
		guardRows.push(
			await attempt(`Reviewer approves non-eligible ${id}`, () => approve(ctx, id, reviewer, 'x'))
		);
		guardRows.push(
			await attempt(`Reviewer executes non-approved ${id}`, () => executeRefund(ctx, id, reviewer))
		);
	}
	approve(ctx, 'CASE-1001', reviewer, 'valid approval');
	guardRows.push(
		await attempt('Second approval of case A', () => approve(ctx, 'CASE-1001', reviewer, 'again'))
	);
	executeRefund(ctx, 'CASE-1001', reviewer);
	guardRows.push(
		await attempt('Second execution of case A', () => executeRefund(ctx, 'CASE-1001', reviewer))
	);
	reject(ctx, 'CASE-1003', reviewer, 'Outside claim window');
	guardRows.push(
		await attempt('Re-investigate rejected case C', () => investigate(ctx, 'CASE-1003', analyst))
	);
}
{
	const ctx = offlineCtx();
	await investigate(ctx, 'CASE-1001', analyst);
	approve(ctx, 'CASE-1001', reviewer, 'valid approval');
	ctx.db
		.prepare(
			"INSERT INTO transactions VALUES ('TX-LATE', 'ORD-5001', 'CUS-001', 'REFUND', 8490, 'USD', 'SUCCEEDED', 're_late', '2026-10-03T00:00:00Z', 'TX-9002', 0)"
		)
		.run();
	guardRows.push(
		await attempt('Execute after a refund appeared post-approval', () =>
			executeRefund(ctx, 'CASE-1001', reviewer)
		)
	);
}

// ---- Live: real AMD inference
type LiveRow = {
	run: number;
	caseId: string;
	expectedRouting: string;
	routing: string;
	routingAgree: boolean;
	aiStatus: string;
	errorCategory: string | null;
	latencyMs: number | null;
	citedRefs: number;
	unsupportedRefs: number;
	modelFlaggedInjection: boolean | null;
	completed: boolean;
};
const liveRows: LiveRow[] = [];
let liveSkipped: string | null = null;
if (live && !isConfigured(amd)) liveSkipped = 'AMD_BASE_URL / AMD_API_KEY / AMD_MODEL not set';
else if (!live) liveSkipped = 'not requested (pass --live)';
else {
	for (let run = 1; run <= runs; run++) {
		const ctx: Ctx = { db: freshDb(), amd };
		for (const sc of SCENARIOS) {
			const out = await investigate(ctx, sc.caseId, analyst);
			const a = q.latestAnalysis(ctx.db, sc.caseId)!;
			const expectedRouting = sc.expected === 'ELIGIBLE' ? 'AWAITING_APPROVAL' : 'NEEDS_REVIEW';
			let completed = false;
			if (out.status === 'AWAITING_APPROVAL' && sc.expected === 'ELIGIBLE') {
				approve(ctx, sc.caseId, reviewer, 'eval approval');
				completed = executeRefund(ctx, sc.caseId, reviewer).status === 'SUCCEEDED';
			} else if (out.status === 'NEEDS_REVIEW' && sc.expected !== 'ELIGIBLE') {
				reject(ctx, sc.caseId, reviewer, 'eval: policy not satisfied');
				completed =
					q.case(ctx.db, sc.caseId)!.status === 'REJECTED' &&
					q.actions(ctx.db, sc.caseId).length === 0;
			}
			const cited = q.evidence(ctx.db, sc.caseId).filter((e) => e.source === 'AI').length;
			liveRows.push({
				run,
				caseId: sc.caseId,
				expectedRouting,
				routing: out.status,
				routingAgree: out.status === expectedRouting,
				aiStatus: a.status,
				errorCategory: a.errorCategory,
				latencyMs: a.latencyMs,
				citedRefs: cited,
				unsupportedRefs: a.unsupportedRefs.length,
				modelFlaggedInjection: a.output?.injectionSuspected ?? null,
				completed
			});
			console.log(
				`[live run ${run}] ${sc.caseId} ${out.status} ai=${a.status}${a.errorCategory ? `(${a.errorCategory})` : ''} ${a.latencyMs ?? '-'}ms`
			);
		}
	}
}

const pct = (n: number, d: number) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
const ok = liveRows.filter((r) => r.aiStatus === 'OK');
const lat = ok.map((r) => r.latencyMs!).sort((a, b) => a - b);
const cited = liveRows.reduce((s, r) => s + r.citedRefs, 0);
const unsupported = liveRows.reduce((s, r) => s + r.unsupportedRefs, 0);
const report = {
	generatedAt: new Date().toISOString(),
	method:
		'Seeded fictional scenarios; expected outcomes defined in src/lib/server/seed.ts independently of any model.',
	offline: {
		policyAgreement: {
			agree: policyRows.filter((r) => r.agree).length,
			total: policyRows.length,
			rows: policyRows
		},
		invalidActionsBlocked: {
			blocked: guardRows.filter((r) => r.blocked).length,
			total: guardRows.length,
			rows: guardRows
		}
	},
	live: liveSkipped
		? { skipped: liveSkipped }
		: {
				model: amd.model,
				endpointHost: new URL(amd.baseUrl!).host,
				runs,
				requests: liveRows.length,
				successfulAnalyses: ok.length,
				routingAgreement: `${liveRows.filter((r) => r.routingAgree).length}/${liveRows.length}`,
				casesCompletedCorrectly: `${liveRows.filter((r) => r.completed).length}/${liveRows.length}`,
				unsupportedReferenceRate: `${unsupported}/${cited} (${pct(unsupported, cited)})`,
				latencyMs: lat.length
					? { min: lat[0], median: lat[Math.floor(lat.length / 2)], max: lat.at(-1), n: lat.length }
					: null,
				errors: liveRows
					.filter((r) => r.aiStatus !== 'OK')
					.map((r) => `${r.caseId}: ${r.aiStatus} ${r.errorCategory ?? ''}`.trim()),
				rows: liveRows
			}
};

mkdirSync('reports', { recursive: true });
writeFileSync('reports/eval-latest.json', JSON.stringify(report, null, 2) + '\n');

console.log('\n== Offline policy agreement ==');
console.table(
	policyRows.map(({ caseId, expected, actual, agree }) => ({ caseId, expected, actual, agree }))
);
console.log('\n== Offline invalid action attempts ==');
console.table(guardRows.map(({ name, blocked }) => ({ attempt: name, blocked })));
console.log(
	`Policy agreement: ${report.offline.policyAgreement.agree}/${report.offline.policyAgreement.total}`
);
console.log(
	`Invalid actions blocked: ${report.offline.invalidActionsBlocked.blocked}/${report.offline.invalidActionsBlocked.total}`
);
console.log('\n== Live AMD ==');
console.log(JSON.stringify({ ...report.live, rows: undefined }, null, 2));
console.log('\nWrote reports/eval-latest.json');
const failed = policyRows.some((r) => !r.agree) || guardRows.some((r) => !r.blocked);
process.exit(failed ? 1 : 0);
