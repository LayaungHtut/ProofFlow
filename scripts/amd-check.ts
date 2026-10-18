// Live AMD connection check: `npm run amd:check`. Sends one tiny real request.
// Writes the outcome (no credentials, no customer content) to reports/amd-check.json.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { testConnection } from '#lib/server/amd.ts';

if (existsSync('.env')) process.loadEnvFile('.env');

const report = await testConnection({
	baseUrl: process.env.AMD_BASE_URL,
	apiKey: process.env.AMD_API_KEY,
	model: process.env.AMD_MODEL,
	timeoutMs: Number(process.env.AMD_TIMEOUT_MS) || 45_000
});

mkdirSync('reports', { recursive: true });
writeFileSync('reports/amd-check.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
