import { getCtx } from '#lib/server/context.ts';
import { q } from '#lib/server/db.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const { db } = getCtx();
	const rows = q
		.cases(db)
		.filter((c) => ['AWAITING_APPROVAL', 'APPROVED', 'ACTION_FAILED'].includes(c.status))
		.map((c) => ({
			...c,
			action: q.latestEvaluation(db, c.id)?.result.proposedAction ?? null,
			approval: q.approval(db, c.id)
		}));
	return { rows };
};
