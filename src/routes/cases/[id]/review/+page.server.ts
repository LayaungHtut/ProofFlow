import { error, fail } from '@sveltejs/kit';
import { z } from 'zod';
import { approve, caseView, executeRefund, reject } from '#lib/server/cases.ts';
import { failure } from '#lib/server/actions.ts';
import { getCtx } from '#lib/server/context.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals }) => {
	const view = caseView(getCtx().db, params.id);
	if (!view) error(404, 'Case not found');
	const r = view.evaluation?.result;
	const a = view.analysis;
	const executed = view.actions.some((x) => x.status === 'SUCCEEDED');
	// Display only: the same conditions are enforced server-side in cases.ts.
	const approvalGates = [
		{
			label: 'Case is awaiting approval',
			ok: view.case.status === 'AWAITING_APPROVAL',
			detail: `Current status: ${view.case.status}`
		},
		{
			label: 'Deterministic policy decision is ELIGIBLE',
			ok: r?.decision === 'ELIGIBLE',
			detail: r
				? `Decision: ${r.decision}${r.reasons.length ? ` — ${r.reasons.join(' ')}` : ''}`
				: 'Policy not evaluated'
		},
		{
			label: 'A specific refund action was proposed by the policy engine',
			ok: Boolean(r?.proposedAction),
			detail: r?.proposedAction ? `${r.proposedAction.transactionId}` : 'No action proposed'
		},
		{
			label: 'AMD analysis is valid and all cited references exist',
			ok: a?.status === 'OK' && a.unsupportedRefs.length === 0,
			detail: !a
				? 'No analysis'
				: a.status !== 'OK'
					? `${a.status}: ${a.errorCategory}`
					: a.unsupportedRefs.length
						? `Unsupported: ${a.unsupportedRefs.join(', ')}`
						: 'Verified'
		},
		{
			label: 'No prior decision recorded',
			ok: !view.approval,
			detail: view.approval ? `${view.approval.decision} by ${view.approval.reviewerName}` : 'None'
		},
		{
			label: 'You have the reviewer role',
			ok: locals.user.role === 'reviewer',
			detail: `Signed in as ${locals.user.name} (${locals.user.role})`
		}
	];
	return {
		...view,
		approvalGates,
		canExecute: ['APPROVED', 'ACTION_FAILED'].includes(view.case.status) && !executed,
		canReject: ['AWAITING_APPROVAL', 'NEEDS_REVIEW'].includes(view.case.status) && !view.approval
	};
};

const reasonSchema = z.string().trim().min(5, 'Give a reason of at least 5 characters').max(500);

export const actions: Actions = {
	approve: async ({ request, params, locals }) => {
		const fd = await request.formData();
		if (fd.get('confirm') !== 'yes')
			return fail(400, { error: 'Confirm that you reviewed the evidence.' });
		const reason = reasonSchema.safeParse(fd.get('reason'));
		if (!reason.success) return fail(400, { error: reason.error.issues[0].message });
		try {
			approve(getCtx(), params.id, locals.user, reason.data);
			return { message: 'Approved. The simulated refund can now be executed.' };
		} catch (e) {
			return failure(e);
		}
	},
	reject: async ({ request, params, locals }) => {
		const reason = reasonSchema.safeParse((await request.formData()).get('reason'));
		if (!reason.success) return fail(400, { error: reason.error.issues[0].message });
		try {
			reject(getCtx(), params.id, locals.user, reason.data);
			return { message: 'Case rejected. No action will be taken.' };
		} catch (e) {
			return failure(e);
		}
	},
	execute: async ({ params, locals }) => {
		try {
			const out = executeRefund(getCtx(), params.id, locals.user);
			return out.status === 'SUCCEEDED'
				? { message: `Simulated refund ${out.actionId} recorded. No real money moved.` }
				: fail(502, { error: `Simulated refund ${out.actionId} failed: ${out.message}` });
		} catch (e) {
			return failure(e);
		}
	}
};
