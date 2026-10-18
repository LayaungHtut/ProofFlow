// Deterministic refund-policy engine. Pure function: no model, no I/O, no clock.
// The language model never decides eligibility; this code does.
import type {
	CaseRow,
	Fact,
	Order,
	Policy,
	PolicyDecision,
	PolicyResult,
	ProposedAction,
	RuleResult,
	Transaction
} from '#lib/types.ts';

export const RULES = {
	RECORDS: 'RP-1', // order and charges on file and linked to the complaining customer
	CONSISTENCY: 'RP-2', // no contradictory records for the same processor reference
	DUPLICATE: 'RP-3', // definition of a duplicate charge
	CLAIM_WINDOW: 'RP-4', // complaint filed within N days of the duplicate charge
	NOT_REFUNDED: 'RP-5', // duplicate not already refunded
	AMOUNT: 'RP-6' // refund limited to the duplicate amount and the order total
} as const;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ms = (iso: string) => Date.parse(iso);
export const money = (cents: number, currency = 'USD') =>
	new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

export type PolicyInput = {
	caseRow: Pick<CaseRow, 'id' | 'customerId' | 'orderId' | 'receivedAt'>;
	order: Order | null;
	/** All transactions on file for the customer. */
	transactions: Transaction[];
	policy: Policy;
};

export function evaluatePolicy({
	caseRow,
	order,
	transactions,
	policy
}: PolicyInput): PolicyResult {
	const rules: RuleResult[] = [];
	const facts: Fact[] = [];
	const rule = (
		clauseId: string,
		outcome: RuleResult['outcome'],
		detail: string,
		refs: string[] = []
	) => rules.push({ clauseId, outcome, detail, refs });
	const skip = (...ids: string[]) =>
		ids.forEach((id) =>
			rule(id, 'NOT_EVALUATED', 'Not evaluated: an earlier rule was not satisfied.')
		);
	const result = (
		decision: PolicyDecision,
		proposedAction: ProposedAction | null = null,
		dupes: PolicyResult['duplicateCandidates'] = []
	): PolicyResult => ({
		policyId: policy.id,
		policyVersion: policy.version,
		decision,
		rules,
		facts,
		duplicateCandidates: dupes,
		proposedAction,
		reasons: rules
			.filter((r) => r.outcome === 'FAIL' || r.outcome === 'INCONCLUSIVE')
			.map((r) => `${r.clauseId}: ${r.detail}`)
	});

	// RP-1: records exist and belong to this customer
	if (!caseRow.orderId || !order) {
		rule(
			RULES.RECORDS,
			'INCONCLUSIVE',
			'No order record is linked to this complaint; evidence is missing.'
		);
		skip(RULES.CONSISTENCY, RULES.DUPLICATE, RULES.CLAIM_WINDOW, RULES.NOT_REFUNDED, RULES.AMOUNT);
		return result('NEEDS_REVIEW');
	}
	if (order.customerId !== caseRow.customerId) {
		rule(
			RULES.RECORDS,
			'INCONCLUSIVE',
			`Order ${order.id} belongs to a different customer than the complainant.`,
			[order.id]
		);
		skip(RULES.CONSISTENCY, RULES.DUPLICATE, RULES.CLAIM_WINDOW, RULES.NOT_REFUNDED, RULES.AMOUNT);
		return result('NEEDS_REVIEW');
	}
	const orderCharges = transactions.filter((t) => t.kind === 'CHARGE' && t.orderId === order.id);
	if (orderCharges.length === 0) {
		rule(RULES.RECORDS, 'INCONCLUSIVE', `No charge records are linked to order ${order.id}.`, [
			order.id
		]);
		skip(RULES.CONSISTENCY, RULES.DUPLICATE, RULES.CLAIM_WINDOW, RULES.NOT_REFUNDED, RULES.AMOUNT);
		return result('NEEDS_REVIEW');
	}
	rule(
		RULES.RECORDS,
		'PASS',
		`Order ${order.id} and ${orderCharges.length} linked charge record(s) are on file.`,
		[order.id, ...orderCharges.map((t) => t.id)]
	);
	facts.push({
		kind: 'CONFIRMED',
		text: `Order ${order.id} total is ${money(order.totalCents, order.currency)}.`,
		refs: [order.id]
	});

	// RP-2: contradictory records (same processor reference, different status/amount) or currency mismatch
	const conflicts: string[] = [];
	const byRef = Map.groupBy(orderCharges, (t) => t.processorRef);
	for (const [ref, group] of byRef) {
		if (group.length > 1 && new Set(group.map((t) => `${t.status}|${t.amountCents}`)).size > 1) {
			conflicts.push(
				`Records ${group.map((t) => `${t.id} (${t.status})`).join(', ')} share processor reference ${ref} but disagree.`
			);
		}
	}
	const wrongCurrency = orderCharges.filter((t) => t.currency !== order.currency);
	if (wrongCurrency.length)
		conflicts.push(
			`Charge(s) ${wrongCurrency.map((t) => t.id).join(', ')} are not in the order currency ${order.currency}.`
		);
	if (conflicts.length) {
		rule(
			RULES.CONSISTENCY,
			'INCONCLUSIVE',
			conflicts.join(' '),
			orderCharges.map((t) => t.id)
		);
		conflicts.forEach((c) => facts.push({ kind: 'SUSPECTED', text: c, refs: [] }));
		skip(RULES.DUPLICATE, RULES.CLAIM_WINDOW, RULES.NOT_REFUNDED, RULES.AMOUNT);
		return result('NEEDS_REVIEW');
	}
	rule(
		RULES.CONSISTENCY,
		'PASS',
		'Charge records are internally consistent.',
		orderCharges.map((t) => t.id)
	);

	// RP-3: duplicate = settled charges on the same order, same amount, distinct processor references,
	// within the window of the first charge, and together exceeding the order total.
	const settled = orderCharges
		.filter((t) => t.status === 'SUCCEEDED')
		.sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
	const settledTotal = settled.reduce((s, t) => s + t.amountCents, 0);
	settled.forEach((t) =>
		facts.push({
			kind: 'CONFIRMED',
			text: `${t.id} settled for ${money(t.amountCents, t.currency)} at ${t.createdAt}.`,
			refs: [t.id]
		})
	);

	const dupes: PolicyResult['duplicateCandidates'] = [];
	if (settled.length > 1 && settledTotal > order.totalCents) {
		const [first, ...rest] = settled;
		for (const t of rest) {
			const withinWindow =
				ms(t.createdAt) - ms(first.createdAt) <= policy.params.duplicateWindowHours * HOUR;
			if (
				t.amountCents === first.amountCents &&
				t.processorRef !== first.processorRef &&
				withinWindow
			) {
				dupes.push({ originalId: first.id, duplicateId: t.id, amountCents: t.amountCents });
			}
		}
	}

	// Signals that something might be a duplicate but cannot be confirmed from the records.
	const suspicious = [
		...orderCharges.filter((t) => t.status === 'PENDING'),
		...transactions.filter(
			(t) =>
				t.kind === 'CHARGE' &&
				t.orderId === null &&
				t.status === 'SUCCEEDED' &&
				t.amountCents === order.totalCents &&
				Math.abs(ms(t.createdAt) - ms(order.placedAt)) <= 14 * DAY
		),
		...(dupes.length === 0 && settled.length > 1 && settledTotal > order.totalCents
			? settled.slice(1)
			: [])
	];
	suspicious.forEach((t) =>
		facts.push({
			kind: 'SUSPECTED',
			text:
				t.status === 'PENDING'
					? `${t.id} is a pending authorization of ${money(t.amountCents, t.currency)}; pending holds are not settled charges.`
					: t.orderId === null
						? `${t.id} (${money(t.amountCents, t.currency)}) is not linked to any order; it may be a separate purchase.`
						: `${t.id} is a settled charge that does not meet the duplicate definition (amount, reference or timing differ).`,
			refs: [t.id]
		})
	);

	if (dupes.length === 0) {
		if (suspicious.length) {
			rule(
				RULES.DUPLICATE,
				'INCONCLUSIVE',
				'No confirmed duplicate, but related charges need manual review.',
				suspicious.map((t) => t.id)
			);
			skip(RULES.CLAIM_WINDOW, RULES.NOT_REFUNDED, RULES.AMOUNT);
			return result('NEEDS_REVIEW');
		}
		rule(
			RULES.DUPLICATE,
			'FAIL',
			`Only ${settled.length} settled charge(s) totalling ${money(settledTotal, order.currency)} for an order of ${money(order.totalCents, order.currency)}; no duplicate on file.`,
			settled.map((t) => t.id)
		);
		skip(RULES.CLAIM_WINDOW, RULES.NOT_REFUNDED, RULES.AMOUNT);
		return result('INELIGIBLE');
	}
	if (dupes.length > 1 || suspicious.length) {
		rule(
			RULES.DUPLICATE,
			'INCONCLUSIVE',
			'More than one candidate duplicate or additional unexplained charges; route to manual review.',
			[...dupes.map((d) => d.duplicateId), ...suspicious.map((t) => t.id)]
		);
		skip(RULES.CLAIM_WINDOW, RULES.NOT_REFUNDED, RULES.AMOUNT);
		return result('NEEDS_REVIEW', null, dupes);
	}
	const dup = settled.find((t) => t.id === dupes[0].duplicateId)!;
	rule(
		RULES.DUPLICATE,
		'PASS',
		`${dup.id} duplicates ${dupes[0].originalId}: same amount, distinct processor references, within ${policy.params.duplicateWindowHours}h, and settled total exceeds the order total.`,
		[dupes[0].originalId, dup.id]
	);
	facts.push({
		kind: 'CONFIRMED',
		text: `Settled total ${money(settledTotal, order.currency)} exceeds order total by ${money(settledTotal - order.totalCents, order.currency)}.`,
		refs: [order.id, ...settled.map((t) => t.id)]
	});

	// RP-4: claim window
	const ageDays = Math.floor((ms(caseRow.receivedAt) - ms(dup.createdAt)) / DAY);
	if (ageDays > policy.params.claimWindowDays) {
		rule(
			RULES.CLAIM_WINDOW,
			'FAIL',
			`Complaint received ${ageDays} days after the duplicate charge; the limit is ${policy.params.claimWindowDays} days.`,
			[caseRow.id, dup.id]
		);
		skip(RULES.NOT_REFUNDED, RULES.AMOUNT);
		return result('INELIGIBLE', null, dupes);
	}
	rule(
		RULES.CLAIM_WINDOW,
		'PASS',
		`Complaint received ${ageDays} day(s) after the duplicate charge (limit ${policy.params.claimWindowDays}).`,
		[caseRow.id, dup.id]
	);

	// RP-5: not already refunded (pending refunds count, to avoid double refunds)
	const refunds = transactions.filter(
		(t) =>
			t.kind === 'REFUND' &&
			t.refundOf === dup.id &&
			(t.status === 'SUCCEEDED' || t.status === 'PENDING')
	);
	const refunded = refunds.reduce((s, t) => s + t.amountCents, 0);
	if (refunded >= dup.amountCents) {
		rule(
			RULES.NOT_REFUNDED,
			'FAIL',
			`${dup.id} has already been refunded (${refunds.map((r) => r.id).join(', ')}).`,
			[dup.id, ...refunds.map((r) => r.id)]
		);
		skip(RULES.AMOUNT);
		return result('INELIGIBLE', null, dupes);
	}
	rule(
		RULES.NOT_REFUNDED,
		'PASS',
		refunded
			? `${money(refunded)} of ${dup.id} already refunded.`
			: `No refund recorded against ${dup.id}.`,
		[dup.id, ...refunds.map((r) => r.id)]
	);

	// RP-6: amount
	const amountCents = Math.min(dup.amountCents - refunded, order.totalCents);
	rule(
		RULES.AMOUNT,
		'PASS',
		`Refund limited to ${money(amountCents, dup.currency)} (the unrefunded duplicate amount).`,
		[dup.id]
	);
	return result(
		'ELIGIBLE',
		{ type: 'SIMULATED_REFUND', transactionId: dup.id, amountCents, currency: dup.currency },
		dupes
	);
}
