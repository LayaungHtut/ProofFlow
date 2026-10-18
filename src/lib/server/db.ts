// SQLite persistence via Node's built-in node:sqlite (no native build step).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type {
	CaseRow,
	CaseStatus,
	Customer,
	Order,
	Policy,
	PolicyResult,
	Transaction
} from '#lib/types.ts';
import type { Analysis } from './analysis.ts';

export type Db = DatabaseSync;

const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, name TEXT NOT NULL, email_masked TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (
	id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), placed_at TEXT NOT NULL,
	total_cents INTEGER NOT NULL CHECK (total_cents >= 0), currency TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS transactions (
	id TEXT PRIMARY KEY, order_id TEXT REFERENCES orders(id), customer_id TEXT NOT NULL REFERENCES customers(id),
	kind TEXT NOT NULL CHECK (kind IN ('CHARGE','REFUND')), amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
	currency TEXT NOT NULL, status TEXT NOT NULL, processor_ref TEXT NOT NULL, created_at TEXT NOT NULL,
	refund_of TEXT REFERENCES transactions(id), sandbox INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS policies (id TEXT PRIMARY KEY, version TEXT NOT NULL, name TEXT NOT NULL, params_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS policy_clauses (id TEXT PRIMARY KEY, policy_id TEXT NOT NULL REFERENCES policies(id), title TEXT NOT NULL, text TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS cases (
	id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id), order_id TEXT REFERENCES orders(id),
	subject TEXT NOT NULL, complaint TEXT NOT NULL, channel TEXT NOT NULL, received_at TEXT NOT NULL,
	status TEXT NOT NULL, scenario TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS evidence_refs (
	id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL REFERENCES cases(id), kind TEXT NOT NULL,
	ref_id TEXT NOT NULL, source TEXT NOT NULL, valid INTEGER NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_analyses (
	id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL REFERENCES cases(id), created_at TEXT NOT NULL,
	status TEXT NOT NULL, model TEXT, latency_ms INTEGER, request_id TEXT, error_category TEXT, error_message TEXT,
	output_json TEXT, unsupported_refs_json TEXT NOT NULL DEFAULT '[]', injection_signals_json TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS policy_evaluations (
	id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL REFERENCES cases(id), created_at TEXT NOT NULL,
	decision TEXT NOT NULL, result_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS approvals (
	id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT NOT NULL UNIQUE REFERENCES cases(id), decision TEXT NOT NULL,
	reviewer_id TEXT NOT NULL, reviewer_name TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
	policy_evaluation_id INTEGER REFERENCES policy_evaluations(id), analysis_id INTEGER REFERENCES ai_analyses(id));
CREATE TABLE IF NOT EXISTS sandbox_actions (
	id TEXT PRIMARY KEY, case_id TEXT NOT NULL REFERENCES cases(id), approval_id INTEGER NOT NULL REFERENCES approvals(id),
	transaction_id TEXT NOT NULL, amount_cents INTEGER NOT NULL, currency TEXT NOT NULL, status TEXT NOT NULL,
	result_json TEXT NOT NULL, actor_id TEXT NOT NULL, created_at TEXT NOT NULL);
-- At most one successful refund per case, enforced by the database itself.
CREATE UNIQUE INDEX IF NOT EXISTS one_success_per_case ON sandbox_actions(case_id) WHERE status = 'SUCCEEDED';
CREATE TABLE IF NOT EXISTS audit_events (
	id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, at TEXT NOT NULL, actor TEXT NOT NULL, type TEXT NOT NULL,
	from_status TEXT, to_status TEXT, detail_json TEXT NOT NULL DEFAULT '{}');
`;

export function openDb(path: string): Db {
	if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
	const db = new DatabaseSync(path);
	db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
	db.exec(SCHEMA);
	return db;
}

/** Runs fn in an IMMEDIATE transaction so concurrent writers serialize. */
export function tx<T>(db: Db, fn: () => T): T {
	db.exec('BEGIN IMMEDIATE');
	try {
		const out = fn();
		db.exec('COMMIT');
		return out;
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
}

type Row = Record<string, unknown>;
const s = (v: unknown) => v as string;
const n = (v: unknown) => Number(v);
const json = <T>(v: unknown): T => JSON.parse(String(v)) as T;

const toCustomer = (r: Row): Customer => ({
	id: s(r.id),
	name: s(r.name),
	emailMasked: s(r.email_masked)
});
const toOrder = (r: Row): Order => ({
	id: s(r.id),
	customerId: s(r.customer_id),
	placedAt: s(r.placed_at),
	totalCents: n(r.total_cents),
	currency: s(r.currency),
	status: s(r.status),
	description: s(r.description)
});
const toTx = (r: Row): Transaction => ({
	id: s(r.id),
	orderId: (r.order_id as string) ?? null,
	customerId: s(r.customer_id),
	kind: r.kind as Transaction['kind'],
	amountCents: n(r.amount_cents),
	currency: s(r.currency),
	status: r.status as Transaction['status'],
	processorRef: s(r.processor_ref),
	createdAt: s(r.created_at),
	refundOf: (r.refund_of as string) ?? null,
	sandbox: Boolean(r.sandbox)
});
const toCase = (r: Row): CaseRow => ({
	id: s(r.id),
	customerId: s(r.customer_id),
	orderId: (r.order_id as string) ?? null,
	subject: s(r.subject),
	complaint: s(r.complaint),
	channel: s(r.channel),
	receivedAt: s(r.received_at),
	status: r.status as CaseStatus,
	scenario: s(r.scenario),
	createdAt: s(r.created_at),
	updatedAt: s(r.updated_at)
});

export type AnalysisRecord = {
	id: number;
	caseId: string;
	createdAt: string;
	status: 'OK' | 'INVALID_OUTPUT' | 'ERROR';
	model: string | null;
	latencyMs: number | null;
	requestId: string | null;
	errorCategory: string | null;
	errorMessage: string | null;
	output: Analysis | null;
	unsupportedRefs: string[];
	injectionSignals: string[];
};
export type EvaluationRecord = {
	id: number;
	caseId: string;
	createdAt: string;
	result: PolicyResult;
};
export type ApprovalRecord = {
	id: number;
	caseId: string;
	decision: 'APPROVED' | 'REJECTED';
	reviewerId: string;
	reviewerName: string;
	reason: string;
	createdAt: string;
	policyEvaluationId: number | null;
	analysisId: number | null;
};
export type ActionRecord = {
	id: string;
	caseId: string;
	approvalId: number;
	transactionId: string;
	amountCents: number;
	currency: string;
	status: 'SUCCEEDED' | 'FAILED';
	result: Record<string, unknown>;
	actorId: string;
	createdAt: string;
};
export type AuditEvent = {
	id: number;
	caseId: string | null;
	at: string;
	actor: string;
	type: string;
	fromStatus: string | null;
	toStatus: string | null;
	detail: Record<string, unknown>;
};
export type EvidenceRef = {
	id: number;
	kind: string;
	refId: string;
	source: 'SYSTEM' | 'AI';
	valid: boolean;
	note: string;
};

export const q = {
	customer: (db: Db, id: string) => {
		const r = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
		return r ? toCustomer(r) : null;
	},
	order: (db: Db, id: string | null) => {
		const r = id ? db.prepare('SELECT * FROM orders WHERE id = ?').get(id) : undefined;
		return r ? toOrder(r) : null;
	},
	orders: (db: Db) => db.prepare('SELECT * FROM orders ORDER BY placed_at DESC').all().map(toOrder),
	customerTransactions: (db: Db, customerId: string) =>
		db
			.prepare('SELECT * FROM transactions WHERE customer_id = ? ORDER BY created_at')
			.all(customerId)
			.map(toTx),
	policy: (db: Db): Policy => {
		const p = db.prepare('SELECT * FROM policies ORDER BY id LIMIT 1').get();
		if (!p) throw new Error('No refund policy configured');
		return {
			id: s(p.id),
			version: s(p.version),
			name: s(p.name),
			params: json(p.params_json),
			clauses: db
				.prepare('SELECT id, title, text FROM policy_clauses WHERE policy_id = ? ORDER BY id')
				.all(s(p.id))
				.map((c) => ({ id: s(c.id), title: s(c.title), text: s(c.text) }))
		};
	},
	case: (db: Db, id: string) => {
		const r = db.prepare('SELECT * FROM cases WHERE id = ?').get(id);
		return r ? toCase(r) : null;
	},
	cases: (db: Db) => db.prepare('SELECT * FROM cases ORDER BY received_at DESC').all().map(toCase),
	latestAnalysis: (db: Db, caseId: string): AnalysisRecord | null => {
		const r = db
			.prepare('SELECT * FROM ai_analyses WHERE case_id = ? ORDER BY id DESC LIMIT 1')
			.get(caseId);
		return r
			? {
					id: n(r.id),
					caseId: s(r.case_id),
					createdAt: s(r.created_at),
					status: r.status as AnalysisRecord['status'],
					model: (r.model as string) ?? null,
					latencyMs: r.latency_ms == null ? null : n(r.latency_ms),
					requestId: (r.request_id as string) ?? null,
					errorCategory: (r.error_category as string) ?? null,
					errorMessage: (r.error_message as string) ?? null,
					output: r.output_json ? json(r.output_json) : null,
					unsupportedRefs: json(r.unsupported_refs_json),
					injectionSignals: json(r.injection_signals_json)
				}
			: null;
	},
	latestEvaluation: (db: Db, caseId: string): EvaluationRecord | null => {
		const r = db
			.prepare('SELECT * FROM policy_evaluations WHERE case_id = ? ORDER BY id DESC LIMIT 1')
			.get(caseId);
		return r
			? {
					id: n(r.id),
					caseId: s(r.case_id),
					createdAt: s(r.created_at),
					result: json(r.result_json)
				}
			: null;
	},
	approval: (db: Db, caseId: string): ApprovalRecord | null => {
		const r = db.prepare('SELECT * FROM approvals WHERE case_id = ?').get(caseId);
		return r
			? {
					id: n(r.id),
					caseId: s(r.case_id),
					decision: r.decision as ApprovalRecord['decision'],
					reviewerId: s(r.reviewer_id),
					reviewerName: s(r.reviewer_name),
					reason: s(r.reason),
					createdAt: s(r.created_at),
					policyEvaluationId: r.policy_evaluation_id == null ? null : n(r.policy_evaluation_id),
					analysisId: r.analysis_id == null ? null : n(r.analysis_id)
				}
			: null;
	},
	actions: (db: Db, caseId: string): ActionRecord[] =>
		db
			.prepare('SELECT * FROM sandbox_actions WHERE case_id = ? ORDER BY created_at')
			.all(caseId)
			.map((r) => ({
				id: s(r.id),
				caseId: s(r.case_id),
				approvalId: n(r.approval_id),
				transactionId: s(r.transaction_id),
				amountCents: n(r.amount_cents),
				currency: s(r.currency),
				status: r.status as ActionRecord['status'],
				result: json(r.result_json),
				actorId: s(r.actor_id),
				createdAt: s(r.created_at)
			})),
	evidence: (db: Db, caseId: string): EvidenceRef[] =>
		db
			.prepare('SELECT * FROM evidence_refs WHERE case_id = ? ORDER BY id')
			.all(caseId)
			.map((r) => ({
				id: n(r.id),
				kind: s(r.kind),
				refId: s(r.ref_id),
				source: r.source as EvidenceRef['source'],
				valid: Boolean(r.valid),
				note: s(r.note)
			})),
	audit: (db: Db, opts: { caseId?: string; limit?: number } = {}): AuditEvent[] =>
		(opts.caseId
			? db
					.prepare('SELECT * FROM audit_events WHERE case_id = ? ORDER BY id DESC LIMIT ?')
					.all(opts.caseId, opts.limit ?? 500)
			: db.prepare('SELECT * FROM audit_events ORDER BY id DESC LIMIT ?').all(opts.limit ?? 500)
		).map((r) => ({
			id: n(r.id),
			caseId: (r.case_id as string) ?? null,
			at: s(r.at),
			actor: s(r.actor),
			type: s(r.type),
			fromStatus: (r.from_status as string) ?? null,
			toStatus: (r.to_status as string) ?? null,
			detail: json(r.detail_json)
		}))
};

export function audit(
	db: Db,
	e: {
		caseId?: string | null;
		actor: string;
		type: string;
		from?: string | null;
		to?: string | null;
		detail?: object;
	}
) {
	db.prepare(
		'INSERT INTO audit_events (case_id, at, actor, type, from_status, to_status, detail_json) VALUES (?, ?, ?, ?, ?, ?, ?)'
	).run(
		e.caseId ?? null,
		new Date().toISOString(),
		e.actor,
		e.type,
		e.from ?? null,
		e.to ?? null,
		JSON.stringify(e.detail ?? {})
	);
}
