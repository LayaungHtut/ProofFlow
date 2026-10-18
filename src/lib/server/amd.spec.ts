import { describe, expect, it, vi } from 'vitest';
import { AmdError, chatCompletion, stripReasoning, testConnection } from './amd.ts';

const config = { baseUrl: 'https://amd.example/v1/', apiKey: 'sk-secret-123', model: 'test-model' };
const noSleep = { sleep: async () => {} };

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}
const ok = (content: string | null) =>
	jsonResponse({ model: 'test-model', choices: [{ message: { content } }] });

async function catchErr(p: Promise<unknown>): Promise<AmdError> {
	try {
		await p;
	} catch (e) {
		return e as AmdError;
	}
	throw new Error('expected rejection');
}

describe('chatCompletion', () => {
	it('returns validated content and sends auth + request id to the right path', async () => {
		const fetch = vi.fn(async () => ok('hello'));
		const res = await chatCompletion(config, [{ role: 'user', content: 'hi' }], {}, { fetch });
		expect(res.content).toBe('hello');
		expect(res.model).toBe('test-model');
		expect(res.requestId).toMatch(/^pf-/);
		const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://amd.example/v1/chat/completions');
		const headers = init.headers as Record<string, string>;
		expect(headers.authorization).toBe('Bearer sk-secret-123');
		expect(headers['x-request-id']).toBe(res.requestId);
		expect(JSON.parse(init.body as string).model).toBe('test-model');
	});

	it('refuses to call anything when not configured', async () => {
		const fetch = vi.fn();
		const err = await catchErr(chatCompletion({ baseUrl: 'x' }, [], {}, { fetch }));
		expect(err.category).toBe('NOT_CONFIGURED');
		expect(fetch).not.toHaveBeenCalled();
	});

	it('maps 401 to AUTH without retrying and never leaks the key', async () => {
		const fetch = vi.fn(async () => jsonResponse({ error: 'bad key sk-secret-123' }, 401));
		const err = await catchErr(chatCompletion(config, [], {}, { fetch, ...noSleep }));
		expect(err.category).toBe('AUTH');
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(err.message).not.toContain('sk-secret-123');
	});

	it('maps 404 to NOT_FOUND (wrong endpoint path or model)', async () => {
		const fetch = vi.fn(async () => new Response('nope', { status: 404 }));
		expect((await catchErr(chatCompletion(config, [], {}, { fetch }))).category).toBe('NOT_FOUND');
	});

	it('retries transient 503 then succeeds, bounded by maxRetries', async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(new Response('', { status: 503 }))
			.mockResolvedValueOnce(ok('recovered'));
		const res = await chatCompletion(config, [], {}, { fetch, ...noSleep });
		expect(res.content).toBe('recovered');
		expect(res.attempts).toBe(2);

		const always503 = vi.fn(async () => new Response('', { status: 503 }));
		const err = await catchErr(
			chatCompletion({ ...config, maxRetries: 2 }, [], {}, { fetch: always503, ...noSleep })
		);
		expect(err.category).toBe('SERVER');
		expect(always503).toHaveBeenCalledTimes(3);
	});

	it('times out a hanging request', async () => {
		const fetch = vi.fn(
			(_url: string | URL | Request, init?: RequestInit) =>
				new Promise<Response>((_, reject) =>
					init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason))
				)
		);
		const err = await catchErr(
			chatCompletion({ ...config, timeoutMs: 20, maxRetries: 1 }, [], {}, { fetch, ...noSleep })
		);
		expect(err.category).toBe('TIMEOUT');
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('rejects malformed responses: non-JSON, wrong shape, empty content', async () => {
		for (const res of [
			new Response('<html>gateway</html>', { status: 200 }),
			jsonResponse({ result: 'x' }),
			ok(null),
			ok('   ')
		]) {
			const err = await catchErr(chatCompletion(config, [], {}, { fetch: async () => res }));
			expect(err.category).toBe('MALFORMED_RESPONSE');
		}
	});

	it('maps network failures to NETWORK', async () => {
		const fetch = vi.fn(async () => {
			throw new TypeError('fetch failed');
		});
		const err = await catchErr(chatCompletion({ ...config, maxRetries: 0 }, [], {}, { fetch }));
		expect(err.category).toBe('NETWORK');
	});
});

describe('testConnection', () => {
	it('reports success with latency and whether the model is listed', async () => {
		const fetch = vi.fn(async (url: string | URL | Request) =>
			String(url).endsWith('/models')
				? jsonResponse({ data: [{ id: 'test-model' }] })
				: ok('<think>x</think>READY')
		);
		const r = await testConnection(config, { fetch });
		expect(r).toMatchObject({
			ok: true,
			modelListed: true,
			reply: 'READY',
			baseUrlHost: 'amd.example'
		});
		expect(JSON.stringify(r)).not.toContain('sk-secret-123');
	});

	it('reports the error category on auth failure', async () => {
		const r = await testConnection(config, {
			fetch: async () => new Response('', { status: 403 })
		});
		expect(r).toMatchObject({ ok: false, errorCategory: 'AUTH' });
	});

	it('still tests chat when /models is not implemented', async () => {
		const fetch = vi.fn(async (url: string | URL | Request) =>
			String(url).endsWith('/models') ? new Response('', { status: 404 }) : ok('READY')
		);
		expect((await testConnection(config, { fetch })).ok).toBe(true);
	});
});

it('stripReasoning removes think blocks', () => {
	expect(stripReasoning('<think>a\nb</think>\n{"a":1}')).toBe('{"a":1}');
});
