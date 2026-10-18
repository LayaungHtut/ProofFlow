import { isConfigured } from '#lib/server/amd.ts';
import { amdConfig, getCtx } from '#lib/server/context.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	const { db } = getCtx();
	const pending = db
		.prepare(
			"SELECT COUNT(*) AS n FROM cases WHERE status IN ('AWAITING_APPROVAL', 'APPROVED', 'ACTION_FAILED')"
		)
		.get() as { n: number };
	return {
		user: locals.user,
		amdConfigured: isConfigured(amdConfig()),
		model: amdConfig().model ?? null,
		pendingApprovals: pending.n
	};
};
