// Case orchestration: evidence → AMD analysis → deterministic policy → human approval → sandbox action.
// Every state change goes through transition(), which enforces the lifecycle and writes an audit event.
import { AmdError, chatCompletion, type AmdConfig } from './amd.ts';
import {
	buildMessages,
	checkReferences,
	detectInjectionSignals,
	parseAnalysis
} from './analysis.ts';
import { audit, q, tx, type Db } from './db.ts';
import { evaluatePolicy } from './policy.ts';
import type { CaseStatus, User } from '#lib/types.ts';

export type SandboxInput = {
	actionId: string;
	transactionId: string;
	amountCents: number;
	currency: string;
};
export type SandboxOutcome = {
	status: 'SUCCEEDED' | 'FAILED';
	processorRef: string | null;
	message: string;
};
/** Simulated refund processor. It never calls a real payment provider. */
export type SandboxProcessor = (input: SandboxInput) => SandboxOutcome;

export const simulatedProcessor: SandboxProcessor = (i) => ({
	status: 'SUCCEEDED',
	processorRef: `sandbox_re_${i.actionId}`,
	message:
		'SIMULATED refund recorded in the ProofFlow sandbox ledger. No real payment processor was called.'
});

export type Ctx = { db: Db; amd: AmdConfig; fetch?: typeof fetch; processor?: SandboxProcessor };

export class DomainError extends Error {
	code: 'NOT_FOUND' | 'FORBIDDEN' | 'INVALID_STATE' | 'BLOCKED' | 'VALIDATION';
	constructor(code: DomainError['code'], message: string) {
		super(message);
		this.code = code;
	}
	get status() {
		return { NOT_FOUND: 404, FORBIDDEN: 403, INVALID_STATE: 409, BLOCKED: 422, VALIDATION: 400 }[
			this.code
		];
	}
}

export const TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
	NEW: ['INVESTIGATING'],
	INVESTIGATING: ['NEEDS_REVIEW', 'AWAITING_APPROVAL'],
	NEEDS_REVIEW: ['INVESTIGATING', 'REJECTED'],
	AWAITING_APPROVAL: ['INVESTIGATING', 'APPROVED', 'REJECTED'],
	APPROVED: ['ACTION_COMPLETED', 'ACTION_FAILED'],
	ACTION_FAILED: ['ACTION_COMPLETED', 'ACTION_FAILED'],
	REJECTED: [],
	ACTION_COMPLETED: []
};

/** Compare-and-set status change. Must be called inside tx(). */
function transition(
	db: Db,
	caseId: string,
	to: CaseStatus,
	actor: string,
	type: string,
	detail: object = {}
) {
	const c = q.case(db, caseId);
	if (!c) throw new DomainError('NOT_FOUND', `Case ${caseId} not found`);
	if (!TRANSITIONS[c.status].includes(to)) {
		throw new DomainError('INVALID_STATE', `Case ${caseId} cannot move from ${c.status} to ${to}`);
	}
	const res = db
		.prepare('UPDATE cases SET status = ?, updated_at = ? WHERE id = ? AND status = ?')
		.run(to, new Date().toISOString(), caseId, c.status);
	if (res.changes !== 1)
		throw new DomainError('INVALID_STATE', `Case ${caseId} changed concurrently`);
	audit(db, { caseId, actor, type, from: c.status, to, detail });
}

function requireReviewer(user: User, attempted: string) {
	if (user.role !== 'reviewer')
		throw new DomainError('FORBIDDEN', `Only a reviewer can ${attempted}.`);
}

/** Runs a protected operation; refused attempts are audited after the rollback so the record survives. */
function guarded<T>(db: Db, caseId: string, user: User, op: string, fn: () => T): T {
	try {
		return tx(db, fn);
	} catch (e) {
		if (e instanceof DomainError) {
			const type = e.code === 'FORBIDDEN' ? 'AUTHORIZATION_DENIED' : 'ACTION_BLOCKED';
			audit(db, {
				caseId,
				actor: user.id,
				type,
				detail: { op, role: user.role, reason: e.message }
			});
		}
		throw e;
	}
}

function loadEvidence(db: Db, caseId: string) {
	const caseRow = q.case(db, caseId);
	if (!caseRow) throw new DomainError('NOT_FOUND', `Case ${caseId} not found`);
	return {
		caseRow,
		order: q.order(db, caseRow.orderId),
		transactions: q.customerTransactions(db, caseRow.customerId),
		policy: q.policy(db)
	};
}

export async function investigate(ctx: Ctx, caseId: string, user: User) {
	const { db } = ctx;
	tx(db, () => transition(db, caseId, 'INVESTIGATING', user.id, 'INVESTIGATION_STARTED'));
	// shortcut: a process crash during the AMD call leaves the case in INVESTIGATING; add a stale-lock sweep if that matters.
	try {
		const bundle = loadEvidence(db, caseId);
		const result = evaluatePolicy(bundle);
		const injectionSignals = detectInjectionSignals(bundle.caseRow.complaint);

		// AMD inference runs outside any DB transaction.
		let ai: Record<string, unknown>;
		try {
			const res = await chatCompletion(
				ctx.amd,
				buildMessages(bundle),
				{ maxTokens: 1500 },
				{ fetch: ctx.fetch }
			);
			const parsed = parseAnalysis(res.content);
			ai = parsed.ok
				? { status: 'OK', output: parsed.analysis, refs: checkReferences(parsed.analysis, bundle) }
				: {
						status: 'INVALID_OUTPUT',
						errorCategory: 'SCHEMA',
						errorMessage: parsed.error,
						refs: []
					};
			Object.assign(ai, { model: res.model, latencyMs: res.latencyMs, requestId: res.requestId });
		} catch (e) {
			const err = e instanceof AmdError ? e : null;
			if (!err) console.error('[investigate] unexpected AI error', e);
			ai = {
				status: 'ERROR',
				model: ctx.amd.model ?? null,
				requestId: err?.requestId ?? null,
				errorCategory: err?.category ?? 'INTERNAL',
				errorMessage: err?.message ?? 'Unexpected error during analysis',
				refs: []
			};
		}
		const refs = ai.refs as ReturnType<typeof checkReferences>;
		const unsupported = refs.filter((r) => !r.valid).map((r) => r.id);

		return tx(db, () => {
			const now = new Date().toISOString();
			const evalId = db
				.prepare(
					'INSERT INTO policy_evaluations (case_id, created_at, decision, result_json) VALUES (?, ?, ?, ?)'
				)
				.run(caseId, now, result.decision, JSON.stringify(result)).lastInsertRowid;
			audit(db, {
				caseId,
				actor: 'policy-engine',
				type: 'POLICY_EVALUATED',
				detail: { decision: result.decision, evaluationId: Number(evalId), reasons: result.reasons }
			});

			const analysisId = db
				.prepare(
					`INSERT INTO ai_analyses (case_id, created_at, status, model, latency_ms, request_id, error_category, error_message, output_json, unsupported_refs_json, injection_signals_json)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
				)
				.run(
					caseId,
					now,
					ai.status as string,
					(ai.model as string) ?? null,
					(ai.latencyMs as number) ?? null,
					(ai.requestId as string) ?? null,
					(ai.errorCategory as string) ?? null,
					(ai.errorMessage as string) ?? null,
					ai.output ? JSON.stringify(ai.output) : null,
					JSON.stringify(unsupported),
					JSON.stringify(injectionSignals)
				).lastInsertRowid;
			audit(db, {
				caseId,
				actor: `amd:${(ai.model as string) ?? 'unconfigured'}`,
				type: ai.status === 'OK' ? 'AI_ANALYSIS_COMPLETED' : 'AI_ANALYSIS_FAILED',
				detail: {
					analysisId: Number(analysisId),
					status: ai.status,
					requestId: ai.requestId,
					latencyMs: ai.latencyMs,
					errorCategory: ai.errorCategory,
					unsupportedRefs: unsupported,
					injectionSignals
				}
			});

			db.prepare('DELETE FROM evidence_refs WHERE case_id = ?').run(caseId);
			const addRef = db.prepare(
				'INSERT INTO evidence_refs (case_id, kind, ref_id, source, valid, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
			);
			if (bundle.order)
				addRef.run(caseId, 'ORDER', bundle.order.id, 'SYSTEM', 1, 'Order on file', now);
			bundle.transactions.forEach((t) =>
				addRef.run(caseId, 'TRANSACTION', t.id, 'SYSTEM', 1, `${t.kind} ${t.status}`, now)
			);
			refs.forEach((r) => addRef.run(caseId, r.kind, r.id, 'AI', r.valid ? 1 : 0, r.note, now));

			const next: CaseStatus =
				result.decision === 'ELIGIBLE' && ai.status === 'OK' && unsupported.length === 0
					? 'AWAITING_APPROVAL'
					: 'NEEDS_REVIEW';
			const why =
				next === 'AWAITING_APPROVAL'
					? 'Deterministic checks passed and AI references verified; human approval required.'
					: result.decision !== 'ELIGIBLE'
						? `Policy decision ${result.decision}.`
						: ai.status !== 'OK'
							? `AI analysis unavailable (${ai.errorCategory}); a valid analysis is required before approval.`
							: `AI cited ${unsupported.length} reference(s) not found in records.`;
			transition(db, caseId, next, 'orchestrator', 'INVESTIGATION_COMPLETED', { reason: why });
			return {
				status: next,
				decision: result.decision,
				aiStatus: ai.status as string,
				unsupported,
				reason: why
			};
		});
	} catch (e) {
		tx(db, () =>
			transition(db, caseId, 'NEEDS_REVIEW', 'orchestrator', 'INVESTIGATION_ERROR', {
				error: 'Internal error during investigation'
			})
		);
		throw e;
	}
}

export function approve(ctx: Ctx, caseId: string, user: User, reason: string) {
	const { db } = ctx;
	return guarded(db, caseId, user, 'approve', () => {
		requireReviewer(user, 'approve a refund');
		const c = q.case(db, caseId);
		if (!c) throw new DomainError('NOT_FOUND', `Case ${caseId} not found`);
		if (q.approval(db, caseId))
			throw new DomainError('INVALID_STATE', 'A decision has already been recorded for this case.');
		if (c.status !== 'AWAITING_APPROVAL')
			throw new DomainError('INVALID_STATE', `Case is ${c.status}, not AWAITING_APPROVAL.`);
		const evaluation = q.latestEvaluation(db, caseId);
		const analysis = q.latestAnalysis(db, caseId);
		if (evaluation?.result.decision !== 'ELIGIBLE' || !evaluation.result.proposedAction) {
			throw new DomainError('BLOCKED', 'Deterministic policy checks have not passed.');
		}
		if (analysis?.status !== 'OK' || analysis.unsupportedRefs.length) {
			throw new DomainError('BLOCKED', 'A verified AI analysis is required before approval.');
		}
		const approvalId = db
			.prepare(
				'INSERT INTO approvals (case_id, decision, reviewer_id, reviewer_name, reason, created_at, policy_evaluation_id, analysis_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.run(
				caseId,
				'APPROVED',
				user.id,
				user.name,
				reason,
				new Date().toISOString(),
				evaluation.id,
				analysis.id
			).lastInsertRowid;
		transition(db, caseId, 'APPROVED', user.id, 'APPROVED', {
			approvalId: Number(approvalId),
			reason,
			proposedAction: evaluation.result.proposedAction
		});
	});
}

export function reject(ctx: Ctx, caseId: string, user: User, reason: string) {
	const { db } = ctx;
	return guarded(db, caseId, user, 'reject', () => {
		requireReviewer(user, 'reject a case');
		if (q.approval(db, caseId))
			throw new DomainError('INVALID_STATE', 'A decision has already been recorded for this case.');
		const evaluation = q.latestEvaluation(db, caseId);
		const approvalId = db
			.prepare(
				'INSERT INTO approvals (case_id, decision, reviewer_id, reviewer_name, reason, created_at, policy_evaluation_id, analysis_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
			)
			.run(
				caseId,
				'REJECTED',
				user.id,
				user.name,
				reason,
				new Date().toISOString(),
				evaluation?.id ?? null,
				q.latestAnalysis(db, caseId)?.id ?? null
			).lastInsertRowid;
		transition(db, caseId, 'REJECTED', user.id, 'REJECTED', {
			approvalId: Number(approvalId),
			reason
		});
	});
}

export function executeRefund(ctx: Ctx, caseId: string, user: User) {
	const { db } = ctx;
	const processor = ctx.processor ?? simulatedProcessor;
	return guarded(db, caseId, user, 'execute', () => {
		requireReviewer(user, 'execute a sandbox refund');
		const c = q.case(db, caseId);
		if (!c) throw new DomainError('NOT_FOUND', `Case ${caseId} not found`);
		if (q.actions(db, caseId).some((a) => a.status === 'SUCCEEDED')) {
			throw new DomainError('INVALID_STATE', 'The refund has already been executed for this case.');
		}
		if (c.status !== 'APPROVED' && c.status !== 'ACTION_FAILED') {
			throw new DomainError('INVALID_STATE', `Case is ${c.status}; an approved case is required.`);
		}
		const approval = q.approval(db, caseId);
		const approved = q.latestEvaluation(db, caseId)?.result.proposedAction;
		if (approval?.decision !== 'APPROVED' || !approved)
			throw new DomainError('BLOCKED', 'No human approval on record.');

		// Re-check the policy against current records: data may have changed since approval.
		const current = evaluatePolicy(loadEvidence(db, caseId));
		const action = current.proposedAction;
		if (
			current.decision !== 'ELIGIBLE' ||
			action?.transactionId !== approved.transactionId ||
			action.amountCents !== approved.amountCents
		) {
			throw new DomainError(
				'BLOCKED',
				`Policy re-check failed at execution time: ${current.reasons.join(' ') || current.decision}`
			);
		}

		const actionId = `ACT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
		let outcome: SandboxOutcome;
		try {
			outcome = processor({ actionId, ...action });
		} catch {
			outcome = {
				status: 'FAILED',
				processorRef: null,
				message: 'Sandbox processor raised an error.'
			};
		}
		const now = new Date().toISOString();
		db.prepare('INSERT INTO sandbox_actions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
			actionId,
			caseId,
			approval.id,
			action.transactionId,
			action.amountCents,
			action.currency,
			outcome.status,
			JSON.stringify({ ...outcome, simulated: true }),
			user.id,
			now
		);
		if (outcome.status === 'SUCCEEDED') {
			const order = q.order(db, c.orderId);
			db.prepare('INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)').run(
				`TX-SBX-${actionId.slice(4)}`,
				order?.id ?? null,
				c.customerId,
				'REFUND',
				action.amountCents,
				action.currency,
				'SUCCEEDED',
				outcome.processorRef ?? actionId,
				now,
				action.transactionId
			);
		}
		transition(
			db,
			caseId,
			outcome.status === 'SUCCEEDED' ? 'ACTION_COMPLETED' : 'ACTION_FAILED',
			user.id,
			outcome.status === 'SUCCEEDED' ? 'SANDBOX_REFUND_SUCCEEDED' : 'SANDBOX_REFUND_FAILED',
			{
				actionId,
				approvalId: approval.id,
				transactionId: action.transactionId,
				amountCents: action.amountCents,
				simulated: true,
				message: outcome.message
			}
		);
		return { actionId, ...outcome };
	});
}

export function createCase(
	ctx: Ctx,
	user: User,
	input: { orderId: string; subject: string; complaint: string }
) {
	const { db } = ctx;
	return tx(db, () => {
		const order = q.order(db, input.orderId);
		if (!order) throw new DomainError('VALIDATION', 'Unknown order ID.');
		const max = db.prepare('SELECT MAX(CAST(SUBSTR(id, 6) AS INTEGER)) AS m FROM cases').get() as {
			m: number | null;
		};
		const id = `CASE-${(max.m ?? 1000) + 1}`;
		const now = new Date().toISOString();
		db.prepare('INSERT INTO cases VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
			id,
			order.customerId,
			order.id,
			input.subject,
			input.complaint,
			'web-form',
			now,
			'NEW',
			'User-submitted (demo order)',
			now,
			now
		);
		audit(db, {
			caseId: id,
			actor: user.id,
			type: 'CASE_CREATED',
			to: 'NEW',
			detail: { orderId: order.id }
		});
		return id;
	});
}

export function caseView(db: Db, id: string) {
	const c = q.case(db, id);
	if (!c) return null;
	return {
		case: c,
		customer: q.customer(db, c.customerId),
		order: q.order(db, c.orderId),
		transactions: q.customerTransactions(db, c.customerId),
		policy: q.policy(db),
		evaluation: q.latestEvaluation(db, id),
		analysis: q.latestAnalysis(db, id),
		approval: q.approval(db, id),
		actions: q.actions(db, id),
		evidence: q.evidence(db, id),
		audit: q.audit(db, { caseId: id })
	};
}
