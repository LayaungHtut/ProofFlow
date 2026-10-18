import { expect, test } from '@playwright/test';

test.beforeAll(async ({ request }) => {
	// Start from known demo data (DEMO_MODE=true in playwright.config.ts).
	const res = await request.post('/settings?/reset', {
		headers: { origin: 'http://localhost:4173' },
		form: {}
	});
	expect(res.ok()).toBe(true);
});

test('dashboard shows the principle, demo disclaimer and work queue', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
	await expect(page.getByText('All customers, orders and payments are fictional')).toBeVisible();
	await expect(page.getByText('CASE-1001').first()).toBeVisible();
});

test('inbox search filters cases', async ({ page }) => {
	await page.goto('/cases');
	await page.getByLabel('Search cases').fill('espresso');
	await page.getByRole('button', { name: 'Filter' }).click();
	await expect(page).toHaveURL(/q=espresso/);
	await expect(page.getByRole('link', { name: 'CASE-1002' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'CASE-1001' })).toHaveCount(0);
});

test('investigation without AMD fails safely and policy still explains the failed rule', async ({
	page
}) => {
	await page.goto('/cases/CASE-1003');
	await page.getByRole('button', { name: 'Run investigation' }).click();
	await expect(page.getByText('Investigation complete')).toBeVisible();
	await expect(page.getByText('AMD inference failed')).toBeVisible();
	await expect(
		page.getByText(/Complaint received \d+ days after the duplicate charge/)
	).toBeVisible();

	await page.getByRole('link', { name: 'Review & approval' }).click();
	await expect(page.getByText('Why it is blocked')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Approve refund' })).toHaveCount(0);
});

test('analyst is refused server-side; reviewer role can reject', async ({ page }) => {
	await page.goto('/cases/CASE-1003/review');
	await page.getByLabel('Reason').fill('Outside the claim window');
	await page.getByRole('button', { name: 'Reject case' }).click();
	await expect(
		page.getByRole('alert').filter({ hasText: 'Only a reviewer can reject a case' })
	).toBeVisible();

	await page.goto('/settings');
	await page.getByLabel('Riley Reviewer (reviewer)').check();
	await page.getByRole('button', { name: 'Switch role' }).click();
	await expect(page.getByText('You are now acting as the reviewer')).toBeVisible();

	await page.goto('/cases/CASE-1003/review');
	await page.getByLabel('Reason').fill('Outside the claim window');
	await page.getByRole('button', { name: 'Reject case' }).click();
	await expect(page.getByText('Case rejected')).toBeVisible();

	await page.goto('/audit?type=AUTHORIZATION_DENIED');
	await expect(page.getByRole('cell', { name: 'AUTHORIZATION_DENIED' }).first()).toBeVisible();
});
