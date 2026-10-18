import { fail } from '@sveltejs/kit';
import { isConfigured, testConnection } from '#lib/server/amd.ts';
import { amdConfig, getCtx, reviewerCodeValid, roleCookie, settings } from '#lib/server/context.ts';
import { audit, q } from '#lib/server/db.ts';
import { seed } from '#lib/server/seed.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const cfg = amdConfig();
	let host: string | null;
	try {
		host = cfg.baseUrl ? new URL(cfg.baseUrl).origin : null;
	} catch {
		host = 'invalid URL';
	}
	const checks = q
		.audit(getCtx().db, { limit: 2000 })
		.filter((e) => e.type.startsWith('AMD_CONNECTION'));
	return {
		amd: {
			configured: isConfigured(cfg),
			endpoint: host,
			model: cfg.model ?? null,
			keyPresent: Boolean(cfg.apiKey),
			timeoutMs: cfg.timeoutMs
		},
		checks: checks.slice(0, 10),
		...settings()
	};
};

export const actions: Actions = {
	test: async ({ locals }) => {
		const report = await testConnection(amdConfig());
		audit(getCtx().db, {
			actor: locals.user.id,
			type: report.ok ? 'AMD_CONNECTION_OK' : 'AMD_CONNECTION_FAILED',
			detail: { ...report, reply: undefined }
		});
		return { report };
	},
	role: async ({ request, cookies }) => {
		const fd = await request.formData();
		const role = fd.get('role') === 'reviewer' ? 'reviewer' : 'analyst';
		if (role === 'reviewer' && !reviewerCodeValid(String(fd.get('code') ?? ''))) {
			return fail(403, { roleError: 'Incorrect reviewer access code.' });
		}
		cookies.set('pf_role', roleCookie(role), {
			path: '/',
			httpOnly: true,
			sameSite: 'strict',
			maxAge: 60 * 60 * 8
		});
		return { roleMessage: `You are now acting as the ${role}.` };
	},
	reset: async ({ locals }) => {
		if (!settings().demoMode)
			return fail(403, { resetError: 'Demo reset is disabled (DEMO_MODE is not true).' });
		const { db } = getCtx();
		seed(db);
		audit(db, { actor: locals.user.id, type: 'DEMO_DATA_RESET' });
		return { resetMessage: 'Demo data restored to its initial state.' };
	}
};
