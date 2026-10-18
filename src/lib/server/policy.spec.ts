import { describe, expect, it } from 'vitest';
import { evaluatePolicy, type PolicyInput } from './policy.ts';
import { openDb, q } from './db.ts';
import { SCENARIOS, seed } from './seed.ts';
import type { Transaction } from '#lib/types.ts';

const db = openDb(':memory:');
seed(db);
const policy = q.policy(db);

function inputFor(caseId: string): PolicyInput {
	const c = q.case(db, caseId)!;
	return {
		caseRow: c,
		order: q.order(db, c.orderId),
		transactions: q.customerTransactions(db, c.customerId),
		policy
	};
}

const charge = (id: string, over: Partial<Transaction> = {}): Transaction => ({
	id,
	orderId: 'ORD-5001',
	customerId: 'CUS-001',
	kind: 'CHARGE',
	amountCents: 8490,
	currency: 'USD',
	status: 'SUCCEEDED',
	processorRef: `ref_${id}`,
	createdAt: '2026-09-28T14:02:00Z',
	refundOf: null,
	sandbox: false,
	...over
});
const base = inputFor('CASE-1001');
const withTxs = (transactions: Transaction[]) => evaluatePolicy({ ...base, transactions });
const ruleOf = (r: ReturnType<typeof evaluatePolicy>, id: string) =>
	r.rules.find((x) => x.clauseId === id)!;

describe('seeded scenarios match expected outcomes defined independently of the model', () => {
	for (const sc of SCENARIOS) {
		it(`${sc.caseId} ${sc.label} → ${sc.expected}`, () => {
			expect(evaluatePolicy(inputFor(sc.caseId)).decision).toBe(sc.expected);
		});
	}

	it('A proposes refunding exactly the later duplicate', () => {
		const r = evaluatePolicy(inputFor('CASE-1001'));
		expect(r.proposedAction).toEqual({
			type: 'SIMULATED_REFUND',
			transactionId: 'TX-9002',
			amountCents: 8490,
			currency: 'USD'
		});
		expect(r.duplicateCandidates).toEqual([
			{ originalId: 'TX-9001', duplicateId: 'TX-9002', amountCents: 8490 }
		]);
		expect(r.rules.every((x) => x.outcome === 'PASS')).toBe(true);
	});

	it('C fails the claim-window rule and proposes no action', () => {
		const r = evaluatePolicy(inputFor('CASE-1003'));
		expect(ruleOf(r, 'RP-4').outcome).toBe('FAIL');
		expect(r.proposedAction).toBeNull();
	});

	it('D (prompt injection) has one charge only; text cannot create a duplicate', () => {
		const r = evaluatePolicy(inputFor('CASE-1004'));
		expect(ruleOf(r, 'RP-3').outcome).toBe('FAIL');
		expect(r.proposedAction).toBeNull();
	});

	it('E is blocked because the duplicate was already refunded', () => {
		expect(ruleOf(evaluatePolicy(inputFor('CASE-1005')), 'RP-5').outcome).toBe('FAIL');
	});

	it('F flags contradictory status for the same processor reference', () => {
		const r = evaluatePolicy(inputFor('CASE-1006'));
		expect(ruleOf(r, 'RP-2').outcome).toBe('INCONCLUSIVE');
		expect(r.proposedAction).toBeNull();
	});
});

describe('policy edge cases', () => {
	it('missing order evidence routes to review', () => {
		const r = evaluatePolicy({ ...base, order: null });
		expect(r.decision).toBe('NEEDS_REVIEW');
		expect(ruleOf(r, 'RP-1').outcome).toBe('INCONCLUSIVE');
	});

	it('order with no linked charges routes to review', () => {
		expect(withTxs([]).decision).toBe('NEEDS_REVIEW');
	});

	it('order of another customer routes to review', () => {
		expect(
			evaluatePolicy({ ...base, caseRow: { ...base.caseRow, customerId: 'CUS-999' } }).decision
		).toBe('NEEDS_REVIEW');
	});

	it('same amount twice is not a duplicate when it is a split payment matching the total', () => {
		const r = evaluatePolicy({
			...base,
			order: { ...base.order!, totalCents: 16980 },
			transactions: [charge('T1'), charge('T2', { createdAt: '2026-09-28T14:03:00Z' })]
		});
		expect(r.decision).toBe('INELIGIBLE');
	});

	it('a pending authorization of the same amount is suspected, not confirmed', () => {
		const r = withTxs([charge('T1'), charge('T2', { status: 'PENDING' })]);
		expect(r.decision).toBe('NEEDS_REVIEW');
		expect(r.facts.some((f) => f.kind === 'SUSPECTED' && f.refs.includes('T2'))).toBe(true);
	});

	it('a failed retry is not a duplicate', () => {
		expect(withTxs([charge('T1'), charge('T2', { status: 'FAILED' })]).decision).toBe('INELIGIBLE');
	});

	it('same processor reference recorded twice identically is not a duplicate charge', () => {
		const r = withTxs([charge('T1', { processorRef: 'x' }), charge('T2', { processorRef: 'x' })]);
		expect(r.decision).not.toBe('ELIGIBLE');
	});

	it('charges far apart in time are suspected, not confirmed', () => {
		expect(
			withTxs([charge('T1'), charge('T2', { createdAt: '2026-10-01T00:00:00Z' })]).decision
		).toBe('NEEDS_REVIEW');
	});

	it('triple charge is routed to manual review', () => {
		const r = withTxs([charge('T1'), charge('T2'), charge('T3')]);
		expect(r.decision).toBe('NEEDS_REVIEW');
		expect(r.duplicateCandidates).toHaveLength(2);
	});

	it('currency mismatch is treated as contradictory', () => {
		expect(withTxs([charge('T1'), charge('T2', { currency: 'EUR' })]).decision).toBe(
			'NEEDS_REVIEW'
		);
	});

	it('pending refund blocks a second refund; partial refund leaves the remainder', () => {
		const dupes = [charge('T1'), charge('T2')];
		const refund = (amountCents: number, status: Transaction['status']) =>
			charge('R1', { kind: 'REFUND', refundOf: 'T2', amountCents, status });
		expect(withTxs([...dupes, refund(8490, 'PENDING')]).decision).toBe('INELIGIBLE');
		expect(withTxs([...dupes, refund(8490, 'FAILED')]).decision).toBe('ELIGIBLE');
		expect(withTxs([...dupes, refund(2000, 'SUCCEEDED')]).proposedAction?.amountCents).toBe(6490);
	});
});
