import { getCtx } from '#lib/server/context.ts';
import { q } from '#lib/server/db.ts';
import { CASE_STATUSES } from '#lib/types.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const { db } = getCtx();
	const search = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
	const statusParam = url.searchParams.get('status') ?? '';
	const status = (CASE_STATUSES as readonly string[]).includes(statusParam) ? statusParam : '';
	const needle = search.toLowerCase();
	const all = q.cases(db);
	const customers = new Map(
		all.map((c) => [c.customerId, q.customer(db, c.customerId)?.name ?? ''])
	);
	const cases = all
		.filter((c) => !status || c.status === status)
		.filter(
			(c) =>
				!needle ||
				[c.id, c.subject, c.orderId ?? '', c.scenario, customers.get(c.customerId)!].some((f) =>
					f.toLowerCase().includes(needle)
				)
		)
		.map((c) => ({
			...c,
			customerName: customers.get(c.customerId)!,
			decision: q.latestEvaluation(db, c.id)?.result.decision ?? null
		}));
	return { cases, search, status, total: all.length };
};
