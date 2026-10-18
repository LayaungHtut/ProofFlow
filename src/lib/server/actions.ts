import { fail } from '@sveltejs/kit';
import { DomainError } from './cases.ts';

/** Expected business refusals become form failures; anything else goes to handleError (no internals leaked). */
export function failure(e: unknown) {
	if (e instanceof DomainError) return fail(e.status, { error: e.message });
	throw e;
}
