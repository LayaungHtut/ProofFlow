import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => value || undefined;

// All private (server-only). Nothing here is ever sent to the browser.
export const variables = defineEnvVars({
	AMD_BASE_URL: {
		schema: optional,
		description: 'OpenAI-compatible base URL of the AMD-hosted endpoint, including /v1'
	},
	AMD_API_KEY: { schema: optional, description: 'API key for the AMD endpoint (Bearer token)' },
	AMD_MODEL: {
		schema: optional,
		description: 'Model ID exactly as listed by GET {AMD_BASE_URL}/models'
	},
	AMD_TIMEOUT_MS: {
		schema: (v) => (v ? Number(v) : 45_000),
		description: 'Per-attempt request timeout in milliseconds'
	},
	DATABASE_PATH: {
		schema: (v) => v || 'data/proofflow.db',
		description: 'SQLite file path (created on first start)'
	},
	DEMO_MODE: {
		schema: (v) => v === 'true',
		description: 'Enables the demo-data reset action'
	},
	REVIEWER_ACCESS_CODE: {
		schema: optional,
		description: 'If set, switching to the reviewer role requires this code'
	}
});
