// The only module that reads SvelteKit env. Core modules receive config as plain parameters.
import * as env from '$app/env/private';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { openDb, type Db } from './db.ts';
import { seedIfEmpty } from './seed.ts';
import type { Ctx } from './cases.ts';
import type { AmdConfig } from './amd.ts';
import type { Role, User } from '#lib/types.ts';

let db: Db | undefined;

export function amdConfig(): AmdConfig {
	return {
		baseUrl: env.AMD_BASE_URL,
		apiKey: env.AMD_API_KEY,
		model: env.AMD_MODEL,
		timeoutMs: env.AMD_TIMEOUT_MS
	};
}

export function getCtx(): Ctx {
	if (!db) {
		db = openDb(env.DATABASE_PATH);
		seedIfEmpty(db);
	}
	return { db, amd: amdConfig() };
}

export const settings = () => ({
	demoMode: env.DEMO_MODE,
	reviewerCodeRequired: Boolean(env.REVIEWER_ACCESS_CODE)
});

// Demo identities. shortcut: no real login; replace with SSO/OIDC before any production use.
export const USERS: Record<Role, User> = {
	analyst: { id: 'u-analyst', name: 'Alex Analyst', role: 'analyst' },
	reviewer: { id: 'u-reviewer', name: 'Riley Reviewer', role: 'reviewer' }
};

// Per-process key: role cookies are invalidated on restart, which is acceptable for the demo.
const key = randomBytes(32);
const sign = (role: string) =>
	`${role}.${createHmac('sha256', key).update(role).digest('base64url')}`;

export function roleCookie(role: Role) {
	return sign(role);
}

export function userFromCookie(value: string | undefined): User {
	const role = value?.split('.')[0];
	if (role === 'reviewer' || role === 'analyst') {
		const expected = Buffer.from(sign(role));
		const actual = Buffer.from(value!);
		if (expected.length === actual.length && timingSafeEqual(expected, actual)) return USERS[role];
	}
	return USERS.analyst;
}

export function reviewerCodeValid(code: string) {
	const expected = env.REVIEWER_ACCESS_CODE;
	if (!expected) return true;
	const a = Buffer.from(code);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}
