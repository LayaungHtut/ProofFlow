import { getCtx } from '#lib/server/context.ts';
import { q } from '#lib/server/db.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const { db } = getCtx();
	const type = url.searchParams.get('type') ?? '';
	const caseId = url.searchParams.get('case') ?? '';
	const all = q.audit(db, { limit: 2000 });
	const events = all.filter((e) => (!type || e.type === type) && (!caseId || e.caseId === caseId));
	return { events, types: [...new Set(all.map((e) => e.type))].sort(), type, caseId };
};
