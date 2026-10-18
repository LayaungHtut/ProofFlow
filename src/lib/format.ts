import type { CaseStatus, PolicyDecision, RuleOutcome } from './types.ts';

export const money = (cents: number, currency = 'USD') =>
	new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

export const dateTime = (iso: string) =>
	new Intl.DateTimeFormat('en-GB', {
		dateStyle: 'medium',
		timeStyle: 'short',
		timeZone: 'UTC'
	}).format(new Date(iso)) + ' UTC';

const tone = {
	neutral: 'bg-slate-100 text-slate-700 ring-slate-300',
	blue: 'bg-blue-50 text-blue-800 ring-blue-300',
	amber: 'bg-amber-50 text-amber-900 ring-amber-300',
	green: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
	red: 'bg-red-50 text-red-800 ring-red-300',
	violet: 'bg-violet-50 text-violet-800 ring-violet-300'
};

export const STATUS_META: Record<CaseStatus, { label: string; cls: string }> = {
	NEW: { label: 'New', cls: tone.neutral },
	INVESTIGATING: { label: 'Investigating', cls: tone.blue },
	NEEDS_REVIEW: { label: 'Needs review', cls: tone.amber },
	AWAITING_APPROVAL: { label: 'Awaiting approval', cls: tone.violet },
	APPROVED: { label: 'Approved', cls: tone.blue },
	REJECTED: { label: 'Rejected', cls: tone.neutral },
	ACTION_COMPLETED: { label: 'Refund simulated', cls: tone.green },
	ACTION_FAILED: { label: 'Action failed', cls: tone.red }
};

export const DECISION_META: Record<PolicyDecision, { label: string; cls: string }> = {
	ELIGIBLE: { label: 'Eligible', cls: tone.green },
	INELIGIBLE: { label: 'Ineligible', cls: tone.red },
	NEEDS_REVIEW: { label: 'Needs review', cls: tone.amber }
};

export const OUTCOME_META: Record<RuleOutcome, { label: string; cls: string }> = {
	PASS: { label: 'Pass', cls: tone.green },
	FAIL: { label: 'Fail', cls: tone.red },
	INCONCLUSIVE: { label: 'Inconclusive', cls: tone.amber },
	NOT_EVALUATED: { label: 'Not evaluated', cls: tone.neutral }
};

export const badge =
	'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap';
