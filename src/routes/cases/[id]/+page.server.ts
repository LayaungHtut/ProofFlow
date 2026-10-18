import { error } from '@sveltejs/kit';
import { caseView, investigate } from '#lib/server/cases.ts';
import { failure } from '#lib/server/actions.ts';
import { getCtx } from '#lib/server/context.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const view = caseView(getCtx().db, params.id);
	if (!view) error(404, 'Case not found');
	return view;
};

export const actions: Actions = {
	investigate: async ({ params, locals }) => {
		try {
			return { investigated: await investigate(getCtx(), params.id, locals.user) };
		} catch (e) {
			return failure(e);
		}
	}
};
