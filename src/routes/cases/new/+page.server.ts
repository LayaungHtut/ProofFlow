import { fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { createCase } from '#lib/server/cases.ts';
import { failure } from '#lib/server/actions.ts';
import { getCtx } from '#lib/server/context.ts';
import { q } from '#lib/server/db.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const { db } = getCtx();
	return {
		orders: q.orders(db).map((o) => ({ ...o, customer: q.customer(db, o.customerId)?.name ?? '' }))
	};
};

const schema = z.object({
	orderId: z.string().regex(/^ORD-\d{1,8}$/, 'Choose an order'),
	subject: z.string().trim().min(3, 'Subject is too short').max(120),
	complaint: z.string().trim().min(10, 'Describe the complaint (10+ characters)').max(4000)
});

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = Object.fromEntries(await request.formData());
		const parsed = schema.safeParse(form);
		if (!parsed.success)
			return fail(400, {
				error: parsed.error.issues[0].message,
				values: form as Record<string, string>
			});
		let id: string;
		try {
			id = createCase(getCtx(), locals.user, parsed.data);
		} catch (e) {
			return failure(e);
		}
		redirect(303, `/cases/${id}`);
	}
};
