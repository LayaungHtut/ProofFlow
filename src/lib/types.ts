// Domain types shared by server and UI. Money is always integer cents.

export const CASE_STATUSES = [
	'NEW',
	'INVESTIGATING',
	'NEEDS_REVIEW',
	'AWAITING_APPROVAL',
	'APPROVED',
	'REJECTED',
	'ACTION_COMPLETED',
	'ACTION_FAILED'
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export type Customer = { id: string; name: string; emailMasked: string };

export type Order = {
	id: string;
	customerId: string;
	placedAt: string;
	totalCents: number;
	currency: string;
	status: string;
	description: string;
};

export type Transaction = {
	id: string;
	orderId: string | null;
	customerId: string;
	kind: 'CHARGE' | 'REFUND';
	amountCents: number;
	currency: string;
	status: 'SUCCEEDED' | 'PENDING' | 'FAILED' | 'REVERSED';
	processorRef: string;
	createdAt: string;
	refundOf: string | null;
	sandbox: boolean;
};

export type PolicyClause = { id: string; title: string; text: string };

export type PolicyParams = { duplicateWindowHours: number; claimWindowDays: number };

export type Policy = {
	id: string;
	version: string;
	name: string;
	params: PolicyParams;
	clauses: PolicyClause[];
};

export type CaseRow = {
	id: string;
	customerId: string;
	orderId: string | null;
	subject: string;
	complaint: string;
	channel: string;
	receivedAt: string;
	status: CaseStatus;
	scenario: string;
	createdAt: string;
	updatedAt: string;
};

export type RuleOutcome = 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'NOT_EVALUATED';
export type PolicyDecision = 'ELIGIBLE' | 'INELIGIBLE' | 'NEEDS_REVIEW';

export type RuleResult = { clauseId: string; outcome: RuleOutcome; detail: string; refs: string[] };
export type Fact = { kind: 'CONFIRMED' | 'SUSPECTED'; text: string; refs: string[] };
export type ProposedAction = {
	type: 'SIMULATED_REFUND';
	transactionId: string;
	amountCents: number;
	currency: string;
};

export type PolicyResult = {
	policyId: string;
	policyVersion: string;
	decision: PolicyDecision;
	rules: RuleResult[];
	facts: Fact[];
	duplicateCandidates: { originalId: string; duplicateId: string; amountCents: number }[];
	proposedAction: ProposedAction | null;
	reasons: string[];
};

export type Role = 'analyst' | 'reviewer';
export type User = { id: string; name: string; role: Role };
