import { getCtx } from '#lib/server/context.ts';
import { q } from '#lib/server/db.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const { db } = getCtx();
	const one = <T>(sql: string) => db.prepare(sql).get() as T;
	const cases = q.cases(db);
	return {
		cases,
		refunds: one<{ n: number; cents: number | null }>(
			"SELECT COUNT(*) AS n, SUM(amount_cents) AS cents FROM sandbox_actions WHERE status = 'SUCCEEDED'"
		),
		blocked: one<{ n: number }>(
			"SELECT COUNT(*) AS n FROM audit_events WHERE type IN ('AUTHORIZATION_DENIED', 'ACTION_BLOCKED')"
		).n,
		ai: one<{ ok: number; failed: number; avgLatency: number | null; unsupported: number }>(
			`SELECT SUM(status = 'OK') AS ok, SUM(status != 'OK') AS failed,
			 AVG(CASE WHEN status = 'OK' THEN latency_ms END) AS avgLatency,
			 SUM(unsupported_refs_json != '[]') AS unsupported FROM ai_analyses`
		),
		recent: q.audit(db, { limit: 8 })
	};
};
