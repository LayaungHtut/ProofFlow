# ProofFlow

**Evidence-driven investigation of duplicate-charge and refund complaints, using an open model hosted on AMD infrastructure.**

> No evidence, no claim. No policy validation, no approval. No human authorization, no financial action.

Built for the AMD Developer Hackathon: ACT III (Reinvent Commerce track).

**All demo data is fictional. Refunds are simulated in an internal sandbox ledger. No real payment processor is ever called.**

---

## The problem

Online merchants get a steady stream of “you charged me twice” complaints. Answering them means checking order records, matching processor transactions, telling settled charges apart from pending holds and unrelated purchases, applying refund policy, and leaving a defensible audit trail. Fully automating it with an LLM is unsafe: models invent transaction IDs, follow instructions hidden in customer messages, and cannot be trusted to authorize money movement.

ProofFlow keeps each job where it belongs:

| Job                                                                              | Done by                                                    |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Reading the complaint, summarizing, spotting missing or conflicting information  | **Open model on AMD** (advisory only)                      |
| Checking that every ID the model cites exists in real records                    | **Code** (reference validator)                             |
| Deciding eligibility (duplicate definition, claim window, prior refunds, amount) | **Code** (deterministic policy engine)                     |
| Authorizing a refund                                                             | **A human reviewer**                                       |
| Executing the refund                                                             | **Sandbox service**: re-checks policy, idempotent, audited |

## Workflow

```
Customer complaint
  → Evidence retrieval (order, customer transactions, policy clauses)       src/lib/server/cases.ts
  → Deterministic policy evaluation (pure function, no model)               src/lib/server/policy.ts
  → AMD-hosted model analysis (OpenAI-compatible, server-side)              src/lib/server/amd.ts
  → Zod validation + every cited ID checked against records                 src/lib/server/analysis.ts
  → Routing: AWAITING_APPROVAL only if policy = ELIGIBLE AND analysis valid AND no unsupported refs
  → Human approval (reviewer role, explicit confirmation, reason)
  → Sandbox refund (policy re-checked at execution, at most one success per case)
  → Audit event for every transition, refusal and model call
```

Case lifecycle (enforced by `TRANSITIONS` in `cases.ts`, with compare-and-set updates):

```
NEW → INVESTIGATING → NEEDS_REVIEW ──→ REJECTED
                    ↘ AWAITING_APPROVAL → APPROVED → ACTION_COMPLETED
                                       ↘ REJECTED  ↘ ACTION_FAILED → (retry) → ACTION_COMPLETED
```

## Architecture

| Layer                   | File                                     | Notes                                                                                                                                                                                                                                 |
| ----------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. AMD inference client | `src/lib/server/amd.ts`                  | `fetch` to `{AMD_BASE_URL}/chat/completions`, Bearer auth, per-attempt timeout, bounded retries (429/5xx/timeout/network only), `x-request-id`, Zod-validated response, typed error categories. Never falls back to another provider. |
| B. Evidence retrieval   | `src/lib/server/db.ts`                   | SQLite via Node's built-in `node:sqlite` (no native build). Orders, transactions, policy clauses.                                                                                                                                     |
| C. Policy engine        | `src/lib/server/policy.ts`               | Pure TypeScript. Rules RP-1…RP-6 return PASS/FAIL/INCONCLUSIVE with evidence refs and confirmed vs suspected facts. Tested without any API.                                                                                           |
| D. Orchestration        | `src/lib/server/cases.ts`, `analysis.ts` | Prompt with the complaint fenced as untrusted data, output schema, reference checks, injection signals, routing.                                                                                                                      |
| E. Approval and action  | `src/lib/server/cases.ts`                | Reviewer-only, state checks, one decision per case (unique index), policy re-check at execution, one successful action per case (partial unique index).                                                                               |
| F. Audit                | `audit_events` table                     | Every transition, model call (model, latency, request ID, error category), refused attempt, sandbox action. Refusals are written after rollback, so they persist.                                                                     |
| G. UI                   | `src/routes/**`                          | SvelteKit 3 / Svelte 5 / Tailwind 4. Dashboard, inbox, workspace, approval screen, approvals queue, audit trail, settings.                                                                                                            |

Only `src/lib/server/context.ts` reads environment variables. Core modules receive config as parameters, so the CLI scripts and tests use them without SvelteKit.

## Demo scenarios (fictional)

Expected outcomes are defined in `src/lib/server/seed.ts` **independently of the model**.

| Case      | Scenario                          | Expected policy decision | Why                                                                                        |
| --------- | --------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------ |
| CASE-1001 | A · Confirmed duplicate candidate | ELIGIBLE                 | Two settled charges, same amount, distinct processor refs, 38 s apart, total exceeds order |
| CASE-1002 | B · Ambiguous                     | NEEDS_REVIEW             | One settled charge, one _pending_ hold, one _unlinked_ charge of the same amount           |
| CASE-1003 | C · Ineligible                    | INELIGIBLE               | Real duplicate, but claim filed 110 days later (RP-4 limit: 60)                            |
| CASE-1004 | D · Prompt injection              | INELIGIBLE               | Complaint orders the AI to approve a $6,200 refund; only one charge exists                 |
| CASE-1005 | E · Already refunded              | INELIGIBLE               | Duplicate already has a refund (RP-5)                                                      |
| CASE-1006 | F · Contradictory records         | NEEDS_REVIEW             | Same processor ref recorded as SUCCEEDED and REVERSED                                      |

The sample policy “Northwind Demo Store Refund Policy” is fictional demonstration data, not legal or financial guidance.

## Setup

Requires **Node.js ≥ 24** (built-in `node:sqlite`, native TypeScript type-stripping for the scripts).

```sh
npm install
cp .env.example .env      # then fill in the AMD values
npm run amd:check         # one tiny live request; writes reports/amd-check.json
npm run dev               # http://localhost:5173
```

The database file is created and seeded on first start. Reset it from **Settings → Reset demo data** (only when `DEMO_MODE=true`), or delete the file.

### Environment variables

All are server-only. Nothing is sent to the browser.

| Variable                                         | Required    | Default             | Meaning                                                                                                          |
| ------------------------------------------------ | ----------- | ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `AMD_BASE_URL`                                   | yes, for AI | –                   | OpenAI-compatible base URL **including `/v1`**                                                                   |
| `AMD_API_KEY`                                    | yes, for AI | –                   | Bearer key for that endpoint                                                                                     |
| `AMD_MODEL`                                      | yes, for AI | –                   | Model ID exactly as returned by `GET {AMD_BASE_URL}/models`                                                      |
| `AMD_TIMEOUT_MS`                                 | no          | `45000`             | Per-attempt timeout; up to 2 retries on transient errors                                                         |
| `DATABASE_PATH`                                  | no          | `data/proofflow.db` | SQLite file                                                                                                      |
| `DEMO_MODE`                                      | no          | `false`             | `true` enables the demo-data reset action                                                                        |
| `REVIEWER_ACCESS_CODE`                           | no          | –                   | If set, switching to the reviewer role requires this code (recommended for a public demo)                        |
| `ORIGIN`                                         | build time  | –                   | Public URL (e.g. `https://proofflow.example.com`), baked in by `npm run build` for SvelteKit's CSRF origin check |
| `PORT`, `HOST`, `PROTOCOL_HEADER`, `HOST_HEADER` | no          | –                   | Standard `@sveltejs/adapter-node` runtime options                                                                |

### AMD endpoint options

ProofFlow talks to any OpenAI-compatible endpoint. It hardcodes no AMD URL; you supply it.

- **AMD Token Factory** (approved for the hackathon, `notebooks.amd.com/tokenfactory`). Pick a model, then copy the base URL, API key and model ID from its detail dialog.
- **Self-hosted vLLM on an AMD Developer Cloud MI300X droplet.** Run `vllm serve <open-model> --api-key <key>` and set `AMD_BASE_URL=http://<droplet-ip>:8000/v1`.

## Commands

| Command                           | What it does                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `npm test`                        | Server unit and integration tests (Vitest, in-memory SQLite, mocked `fetch`; no network)       |
| `npm run test:e2e`                | Builds, starts the production server with AMD **unset**, runs Playwright                       |
| `npm run check`                   | `svelte-check` strict type check                                                               |
| `npm run lint`                    | Prettier and ESLint                                                                            |
| `npm run eval`                    | Offline evaluation (policy agreement and invalid-action blocking) → `reports/eval-latest.json` |
| `npm run eval -- --live --runs 3` | Adds real AMD requests for all six scenarios, 3 runs each                                      |
| `npm run amd:check`               | One live connection test → `reports/amd-check.json`                                            |
| `npm run build && npm start`      | Production build and server (adapter-node)                                                     |

## Evaluation

`scripts/eval.ts` measures:

1. **Case-level decision agreement:** deterministic policy decision vs the predefined expected outcome (6 cases).
2. **Invalid action attempts blocked:** 17 attempts (analyst approval/execution, approving non-eligible cases, executing unapproved cases, double approval, double execution, acting on a terminal case, executing after a refund appeared post-approval).
3. **Live (`--live`):** routing agreement, cases completed correctly end to end, unsupported-reference rate (model-cited IDs not found in records ÷ all model-cited IDs), and AMD latency (min/median/max over successful requests).

Sample size is small (6 scenarios × N runs) and the data is synthetic. Treat results as a functional check, not a benchmark.

### Results recorded so far

| Measure                         | Result               | Method                                                                                   |
| ------------------------------- | -------------------- | ---------------------------------------------------------------------------------------- |
| Policy decision agreement       | **6/6**              | offline, `npm run eval`                                                                  |
| Invalid action attempts blocked | **17/17**            | offline; a schema-valid stub stands in for the model so guards can be exercised          |
| Live AMD metrics                | **Not yet measured** | no AMD credentials were available in the build environment; run `npm run eval -- --live` |

## Security model

- The customer message, retrieved text and model output are all untrusted. The complaint goes into the prompt inside a delimiter that the complaint itself cannot close. Deterministic red flags (override instructions, role impersonation, claimed pre-approval, card numbers, links) are recorded and shown.
- The model has **no tools**. It cannot fetch URLs, run commands or write to the database. Its output is parsed into a fixed schema, and every cited ID is checked for existence and kind.
- Eligibility comes only from `policy.ts`. Approval requires the reviewer role, `AWAITING_APPROVAL`, an ELIGIBLE evaluation with a proposed action, and a valid analysis with no unsupported references. Execution re-runs the policy on current data.
- Duplicate execution is prevented in code **and** by a partial unique index (`one_success_per_case`).
- Role cookie: HMAC-signed, `httpOnly`, `SameSite=Strict`. Forged values fall back to analyst. SvelteKit's CSRF origin check is on.
- Errors shown to users never include stack traces or credentials. The API key appears only in the outgoing `Authorization` header.
- Headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`.

## Deployment

The app needs a **persistent disk** for SQLite and a host that can **reach your AMD endpoint**. Serverless platforms without a writable persistent filesystem are not suitable.

```sh
docker build --build-arg ORIGIN=https://your-app.example.com -t proofflow .
docker run -p 3000:3000 -v proofflow-data:/data \
  -e AMD_BASE_URL=... -e AMD_API_KEY=... -e AMD_MODEL=... \
  -e DEMO_MODE=true -e REVIEWER_ACCESS_CODE=... proofflow
```

Behind a TLS-terminating proxy (Render, Railway, Fly.io…) the defaults work. If you serve over **plain http** without `ORIGIN`, set `PROTOCOL_HEADER=x-forwarded-proto` and have the proxy send it. Otherwise adapter-node assumes https and form posts fail the CSRF check (`Cross-site POST form submissions are forbidden`).

After deploying, open **Settings → Test live connection** to confirm the host can reach the AMD endpoint.

## AMD connection troubleshooting

| Category                  | Likely cause                                              | Fix                                                                     |
| ------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| `NOT_CONFIGURED`          | One of `AMD_BASE_URL`, `AMD_API_KEY`, `AMD_MODEL` missing | Set all three and restart                                               |
| `AUTH` (401/403)          | Wrong or expired key                                      | Regenerate in Token Factory / check vLLM `--api-key`                    |
| `NOT_FOUND` (404)         | Base URL missing `/v1`, or wrong model ID                 | Compare with `GET {AMD_BASE_URL}/models`                                |
| `TIMEOUT`                 | Cold model, large prompt, slow network                    | Raise `AMD_TIMEOUT_MS`                                                  |
| `NETWORK`                 | Host can't reach endpoint (firewall, droplet port closed) | `curl {AMD_BASE_URL}/models -H "Authorization: Bearer …"` from the host |
| `RATE_LIMIT` / `SERVER`   | Provider throttling or outage                             | Retried automatically (2×); try later                                   |
| `MALFORMED_RESPONSE`      | Endpoint isn't OpenAI-compatible or returned HTML         | Check the URL points at the API, not a web page                         |
| Analysis `INVALID_OUTPUT` | Model didn't return the JSON schema                       | Use a stronger instruct model; the case safely goes to review           |

## What was actually tested

| Integration                                                                                           | Status                                                                                   |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| AMD client against mocked HTTP (success, 401, 404, 503 retry, timeout, malformed, network)            | ✅ automated tests                                                                       |
| Policy engine, orchestration, approvals, sandbox, audit, prompt injection                             | ✅ 53 unit and integration tests                                                         |
| Production server over HTTP, all pages and form actions (including CSRF, forged cookie, XSS escaping) | ✅ manual curl runs and 4 Playwright E2E tests                                           |
| Full approve → execute flow over HTTP                                                                 | ✅ with a local OpenAI-compatible **test double** (not AMD; only exercises the plumbing) |
| Mobile layout (390 px): no horizontal overflow on all 9 pages                                         | ✅ Playwright check                                                                      |
| **Live AMD inference**                                                                                | ❌ **Not yet run.** No credentials in the build environment                              |
| Docker image build                                                                                    | ❌ Not verified (Docker daemon unavailable during development)                           |

## Limitations

- Demo identities only (analyst/reviewer switch); no real authentication. Use `REVIEWER_ACCESS_CODE` on a public deployment.
- Single-node SQLite. A crash during the model call can leave a case in `INVESTIGATING` (no stale-lock sweep yet).
- The policy covers duplicate charges only, with one fictional policy.
- AI analysis is required before approval, so if the AMD endpoint is down, eligible cases wait in `NEEDS_REVIEW` until re-investigated. This is deliberate.
- Prompt-injection signals are heuristics for display. Safety rests on the architecture (no tools, deterministic eligibility, human approval), not on detection.
