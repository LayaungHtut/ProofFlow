import { defineConfig } from '@playwright/test';

export default defineConfig({
	webServer: {
		// Tests the real production server (adapter-node), not the dev/preview server.
		command: 'npm run build && node build/index.js',
		url: 'http://localhost:4173',
		timeout: 180_000,
		// Isolated DB; AMD deliberately unset so E2E never depends on a model.
		env: {
			PORT: '4173',
			PROTOCOL_HEADER: 'x-forwarded-proto',
			DATABASE_PATH: 'test-results/e2e.db',
			DEMO_MODE: 'true',
			AMD_BASE_URL: '',
			AMD_API_KEY: '',
			AMD_MODEL: ''
		}
	},
	// adapter-node assumes https unless told otherwise; this mimics a proxy over plain http.
	use: { baseURL: 'http://localhost:4173', extraHTTPHeaders: { 'x-forwarded-proto': 'http' } },
	testMatch: '**/*.e2e.{ts,js}',
	workers: 1,
	fullyParallel: false
});
