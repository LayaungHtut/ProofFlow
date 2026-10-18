// Server-only client for the AMD-hosted, OpenAI-compatible inference endpoint
// (AMD Token Factory / AMD Developer Cloud vLLM). Never import this from client code.
import { z } from 'zod';

export type AmdConfig = {
	baseUrl?: string;
	apiKey?: string;
	model?: string;
	timeoutMs?: number;
	maxRetries?: number;
};

export type AmdErrorCategory =
	| 'NOT_CONFIGURED'
	| 'AUTH'
	| 'NOT_FOUND'
	| 'BAD_REQUEST'
	| 'RATE_LIMIT'
	| 'SERVER'
	| 'TIMEOUT'
	| 'NETWORK'
	| 'MALFORMED_RESPONSE';

const RETRYABLE: AmdErrorCategory[] = ['RATE_LIMIT', 'SERVER', 'TIMEOUT', 'NETWORK'];

/** Error whose message is safe to show users: it never contains credentials or response bodies. */
export class AmdError extends Error {
	category: AmdErrorCategory;
	status?: number;
	requestId: string;
	constructor(category: AmdErrorCategory, message: string, requestId: string, status?: number) {
		super(message);
		this.name = 'AmdError';
		this.category = category;
		this.status = status;
		this.requestId = requestId;
	}
}

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ChatResult = {
	content: string;
	model: string;
	latencyMs: number;
	requestId: string;
	attempts: number;
	usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
};

const completionSchema = z.object({
	model: z.string().optional(),
	choices: z
		.array(z.object({ message: z.object({ content: z.string().nullable().optional() }) }))
		.min(1),
	usage: z
		.object({
			prompt_tokens: z.number().optional(),
			completion_tokens: z.number().optional(),
			total_tokens: z.number().optional()
		})
		.optional()
		.nullable()
});

const modelsSchema = z.object({ data: z.array(z.object({ id: z.string() })) });

export function isConfigured(config: AmdConfig): boolean {
	return Boolean(config.baseUrl && config.apiKey && config.model);
}

function categorize(status: number): AmdErrorCategory {
	if (status === 401 || status === 403) return 'AUTH';
	if (status === 404) return 'NOT_FOUND';
	if (status === 408) return 'TIMEOUT';
	if (status === 429) return 'RATE_LIMIT';
	if (status >= 500) return 'SERVER';
	return 'BAD_REQUEST';
}

const MESSAGES: Record<AmdErrorCategory, string> = {
	NOT_CONFIGURED: 'AMD inference is not configured (AMD_BASE_URL, AMD_API_KEY, AMD_MODEL).',
	AUTH: 'AMD endpoint rejected the credentials.',
	NOT_FOUND: 'AMD endpoint path or model was not found.',
	BAD_REQUEST: 'AMD endpoint rejected the request.',
	RATE_LIMIT: 'AMD endpoint rate limit reached.',
	SERVER: 'AMD endpoint returned a server error.',
	TIMEOUT: 'AMD endpoint did not respond before the timeout.',
	NETWORK: 'AMD endpoint could not be reached.',
	MALFORMED_RESPONSE: 'AMD endpoint returned a response in an unexpected format.'
};

type Deps = { fetch?: typeof fetch; sleep?: (ms: number) => Promise<void> };

async function request(
	config: AmdConfig,
	path: string,
	init: { method: 'GET' | 'POST'; body?: unknown },
	deps: Deps = {}
): Promise<{ json: unknown; requestId: string; latencyMs: number; attempts: number }> {
	const requestId = `pf-${crypto.randomUUID()}`;
	if (!isConfigured(config))
		throw new AmdError('NOT_CONFIGURED', MESSAGES.NOT_CONFIGURED, requestId);

	const doFetch = deps.fetch ?? fetch;
	const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
	const url = `${config.baseUrl!.replace(/\/+$/, '')}${path}`;
	const maxRetries = config.maxRetries ?? 2;
	const started = performance.now();

	for (let attempt = 1; ; attempt++) {
		let err: AmdError;
		let retryAfterMs = 0;
		try {
			const res = await doFetch(url, {
				method: init.method,
				headers: {
					authorization: `Bearer ${config.apiKey}`,
					'content-type': 'application/json',
					'x-request-id': requestId
				},
				body: init.body === undefined ? undefined : JSON.stringify(init.body),
				signal: AbortSignal.timeout(config.timeoutMs ?? 45_000)
			});
			if (res.ok) {
				let json: unknown;
				try {
					json = await res.json();
				} catch {
					throw new AmdError(
						'MALFORMED_RESPONSE',
						MESSAGES.MALFORMED_RESPONSE,
						requestId,
						res.status
					);
				}
				return {
					json,
					requestId,
					latencyMs: Math.round(performance.now() - started),
					attempts: attempt
				};
			}
			const category = categorize(res.status);
			err = new AmdError(
				category,
				`${MESSAGES[category]} (HTTP ${res.status})`,
				requestId,
				res.status
			);
			retryAfterMs = Math.min(Number(res.headers.get('retry-after')) * 1000 || 0, 10_000);
			await res.body?.cancel().catch(() => {});
		} catch (e) {
			if (e instanceof AmdError) throw e;
			const name = (e as Error)?.name;
			const category = name === 'TimeoutError' || name === 'AbortError' ? 'TIMEOUT' : 'NETWORK';
			err = new AmdError(category, MESSAGES[category], requestId);
		}
		console.warn('[amd]', { requestId, attempt, category: err.category, status: err.status });
		if (!RETRYABLE.includes(err.category) || attempt > maxRetries) throw err;
		await sleep(retryAfterMs || 500 * 2 ** (attempt - 1));
	}
}

export async function chatCompletion(
	config: AmdConfig,
	messages: ChatMessage[],
	opts: { temperature?: number; maxTokens?: number } = {},
	deps: Deps = {}
): Promise<ChatResult> {
	const { json, requestId, latencyMs, attempts } = await request(
		config,
		'/chat/completions',
		{
			method: 'POST',
			body: {
				model: config.model,
				messages,
				temperature: opts.temperature ?? 0,
				max_tokens: opts.maxTokens ?? 1200
			}
		},
		deps
	);
	const parsed = completionSchema.safeParse(json);
	const content = parsed.success ? parsed.data.choices[0].message.content : null;
	if (!parsed.success || typeof content !== 'string' || content.trim() === '') {
		throw new AmdError('MALFORMED_RESPONSE', MESSAGES.MALFORMED_RESPONSE, requestId);
	}
	console.info('[amd]', {
		requestId,
		model: parsed.data.model ?? config.model,
		latencyMs,
		attempts
	});
	return {
		content,
		model: parsed.data.model ?? config.model!,
		latencyMs,
		requestId,
		attempts,
		usage: parsed.data.usage ?? undefined
	};
}

export type ConnectionReport = {
	ok: boolean;
	checkedAt: string;
	baseUrlHost: string | null;
	model: string | null;
	modelListed: boolean | null;
	latencyMs: number | null;
	requestId: string | null;
	errorCategory: AmdErrorCategory | null;
	message: string;
	reply: string | null;
};

/** Lists models (non-fatal: some providers omit /models) then sends a tiny real chat request. */
export async function testConnection(
	config: AmdConfig,
	deps: Deps = {}
): Promise<ConnectionReport> {
	let baseUrlHost: string | null;
	try {
		baseUrlHost = config.baseUrl ? new URL(config.baseUrl).host : null;
	} catch {
		baseUrlHost = 'invalid-url';
	}
	const report: ConnectionReport = {
		ok: false,
		checkedAt: new Date().toISOString(),
		baseUrlHost,
		model: config.model ?? null,
		modelListed: null,
		latencyMs: null,
		requestId: null,
		errorCategory: null,
		message: '',
		reply: null
	};
	try {
		const { json } = await request(
			{ ...config, maxRetries: 0 },
			'/models',
			{ method: 'GET' },
			deps
		);
		const models = modelsSchema.safeParse(json);
		if (models.success) report.modelListed = models.data.data.some((m) => m.id === config.model);
	} catch (e) {
		if (e instanceof AmdError && (e.category === 'NOT_CONFIGURED' || e.category === 'AUTH')) {
			return { ...report, errorCategory: e.category, requestId: e.requestId, message: e.message };
		}
	}
	try {
		const res = await chatCompletion(
			config,
			[{ role: 'user', content: 'Reply with exactly the word: READY' }],
			{ maxTokens: 300 },
			deps
		);
		return {
			...report,
			ok: true,
			model: res.model,
			latencyMs: res.latencyMs,
			requestId: res.requestId,
			reply: stripReasoning(res.content).slice(0, 40),
			message: 'Live inference request succeeded.'
		};
	} catch (e) {
		const err = e instanceof AmdError ? e : new AmdError('NETWORK', MESSAGES.NETWORK, 'n/a');
		return {
			...report,
			errorCategory: err.category,
			requestId: err.requestId,
			message: err.message
		};
	}
}

/** Reasoning models (DeepSeek-R1, Qwen3) may prefix output with <think>…</think>. */
export function stripReasoning(text: string): string {
	return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}
