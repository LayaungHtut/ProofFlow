import type { Handle, HandleServerError } from '@sveltejs/kit/hooks';
import { userFromCookie } from '#lib/server/context.ts';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = userFromCookie(event.cookies.get('pf_role'));
	const response = await resolve(event);
	response.headers.set('x-content-type-options', 'nosniff');
	response.headers.set('referrer-policy', 'same-origin');
	response.headers.set('x-frame-options', 'DENY');
	return response;
};

// Never expose stack traces or internal messages to users.
export const handleError: HandleServerError = ({ error, event }) => {
	const id = crypto.randomUUID().slice(0, 8);
	console.error(`[error ${id}] ${event.request.method} ${event.url.pathname}`, error);
	return { message: `Something went wrong (ref ${id}).` };
};
