# Tasks

Ordered work from foundation to production line. Check items off in PRs; keep this file the single backlog for structural work.

## Phase 0 — Foundation (current)

- [x] Create `docs/architecture.md`, `design.md`, `fallback.md`, `tasks.md`, `boundaries.md`, `criteria.md`
- [x] Scaffold pnpm monorepo with `packages/*` and `apps/*`
- [x] Establish domain / application / adapters / shared package boundaries
- [x] Stub ports: repositories, EventBus, LlmPort, AgentMailbox
- [x] Stub in-memory adapters and composition roots
- [x] Document official platform catalog in `docs/platform-apis.md`
- [x] Add platform ports + `@egov/adapters-egov-platform` (env-backed fetch)
- [x] Add root scripts: `hygiene`, `smoke:platform` (credential + safe probes)
- [x] Add root `test` suite beyond platform smoke (`node:test` via `pnpm test` — `--if-present` across workspace; builds then runs `packages/application` + `packages/adapters-persistence` test files — 12 tests)
- [ ] Add CI workflow for typecheck on PR

## Phase 0.5 — Platform verticals

> **Live runs (2026-07-22):** `pnpm smoke:platform` (write=false) against real sandbox credentials — first pass: **5 pass, 4 skip, 0 fail**. Follow-up targeted runs: eMessage `--write` → real **PASS** (`pushSms ok`, live SMS delivered); SSO with a placeholder exchange code → correctly rejected with `422 Platform HTTP` (**not a bug** — SSO exchange codes are single-use/time-limited, only obtainable by completing a real login redirect against `hackathon-sso.e.gov.ph`; a fake code cannot smoke-test this endpoint further, and the 422 response confirms the adapter's request shape and error mapping are both correct). Face Liveness `--write` run was attempted and failed with exit code 1 — root cause not yet captured (see item below). This section replaces an earlier, looser "operator-confirmed, all pass" note from 2026-07-21 that overstated coverage before any live run existed.

- [ ] Validate SSO token + partner auth against hackathon SSO with dashboard credentials — **attempted, correctly rejected fake code (422)**: adapter request/error-mapping confirmed correct; a real exchange code (from an actual completed SSO login redirect) is required to validate the success path, and cannot be obtained by this script alone
- [x] Validate eVerify auth + query + QR flows — **PASS**: `authenticate ok (token issued)`
- [ ] Face liveness session/result with `SUCCEEDED` && confidence ≥ 95.0 gate in a use case — **path fixed (2026-07-22):** adapter now uses dashboard paths `POST /v1/liveness/session` + `GET /v1/liveness/result/:token` with `x-api-key` auth (was wrong `/api/session` → 404). Gate logic (`isFaceLivenessPassed` + `confirmCitizenIdentity`) already unit-tested. **HTTP for Android:** `POST /bangon/liveness/session`, `GET /bangon/liveness/result/:token`. Still needs a live `--write` smoke with real capture to tick this fully (session create alone is not enough without a completed capture).
- [x] eMessage SMS push smoke test — **PASS** (live, `--write`): `pushSms ok`, real SMS delivered to a real number
- [x] eGov AI token + one assistant call; decide composition vs local `LlmPort` — **PASS**: `token ok (credits_remaining=200)` (auth/credits check only, no generation call made — no credits spent); composition decision: `EgovAiPort` used directly for BANGON narration, `LlmPort`/Ollama kept separate for orchestrator agents — not unified
- [x] eGovPay generate/get/void with HMAC digest verification — **PASS**: `token get reached platform (VALIDATION; expected for probe id)` — connectivity/auth confirmed, full generate/get/void cycle not yet exercised
- [x] eGovChain `eth_blockNumber` smoke via thin JSON-RPC port — **PASS**: `eth_blockNumber ok`
- [ ] eReport datasets + submit/OTP path — **code fixed (2026-07-22), live-run pending**: full adapter rewrite against the real dashboard API reference (`platforms.e.gov.ph/dashboard/api-catalogs/ereport`) — correct base path `/api/integration`, correct auth (`Bearer access_token` for datasets/submit/verify, `X-EReport-View-Token` for reports list/view — three distinct tokens, not one), correct request/response field names for all 11 endpoints (report types, regions, provinces, municipalities, barangays, token, submit_complaint, OTP request/confirm, reports list/view). `reportBenefitNonDelivery` updated to the real structured complaint fields, mapped to report_type `"red_tape"` (closest fit — no exact "benefit not delivered" category exists). Typechecks clean, no live call made yet — **do not mark PASS until `pnpm smoke:platform --only=ereport` is re-run against real credentials and confirmed**.
- [x] DBM Compass SAAODB/NCA/SARO/LGSF query smoke — **PASS**: `reached platform (VALIDATION)` — connectivity/auth confirmed, full dataset-by-dataset query not yet exercised
- [ ] Align adapter path maps with live OpenAPI from the dashboard (no invented endpoints) — Face Liveness and eReport paths now fixed against real dashboard docs; still open: `anchorBenefitMatch`'s JSON-RPC method name (`egov_anchorHash`, placeholder, see Phase 1 BANGON section) — same class of unverified guess, not yet checked against the dashboard
- [x] Add `pnpm smoke:platform` runner (safe probes by default; `--write` for side effects) — confirmed working, this is how the above was run

## Phase 1 — Core domain vertical

> **STANDBY (2026-07-21):** Judging criteria refinement and product use-case expansion (e.g. multi-agency modeling) are on hold until the operator lifts standby. The items below already built are noted as such; anything still unchecked should not be started without asking.

- [x] Flesh out `ServiceCase` invariants and transitions (`packages/domain/src/index.ts`: `createServiceCase`, `advanceServiceCase`, status machine) — `Citizen` and `CaseDocument` types exist but have no invariants/validation beyond their shape yet
- [x] Implement use cases: submit case, get case, advance status (`packages/application/src/use-cases/service-cases.ts`)
- [x] Implement use case: attach document (`attachDocument` in `packages/application/src/use-cases/service-cases.ts` — thin pass-through: validates the case exists, then stores + associates via `DocumentStore`; no content-type/size/scan logic, per `docs/design.md`'s undecided "Document virus scanning / retention policy")
- [x] Contract tests for repository ports (in-memory) (`packages/adapters-persistence/src/repositories.test.ts` — 7 tests covering Citizen/ServiceCase/Document/AgentTask/BenefitMatch repositories + HashPort)
- [x] HTTP adapters for case endpoints (`packages/adapters-http/src/index.ts`: `createCaseHttpHandlers` — submit/get/advance)
- [x] `apps/api` boots and serves health + case routes (`apps/api/src/main.ts`: `/health`, `POST /cases`, `GET /cases/:id`, `POST /cases/:id/advance`)

### BANGON — benefit-eligibility matching (see `docs/architecture.md` Product Vision → BANGON section for full detail)

- [x] `Benefit`, `EligibilityRule`, `BenefitMatch`, `CitizenEligibilityProfile` domain types + pure `isEligibleForBenefit` (`packages/domain/src/index.ts`) — eligibility fields limited to eVerify/PSA data only (DOB, civil status, vital status)
- [x] `BenefitCatalogPort`, `BenefitMatchRepository`, `HashPort` (`packages/application/src/ports/index.ts`)
- [x] `findEligibleBenefits`, `notifyEligibility`, `disburseBenefit`, `confirmCitizenIdentity`, `anchorBenefitMatch`, `explainEligibility`, `reportBenefitNonDelivery` use cases (`packages/application/src/use-cases/bangon.ts`) — fund-check-before-match ordering (persisted via `BenefitMatchRepository`), fail-closed on fund-check errors, non-financial disbursement guard, Face Liveness gate enforced before eVerify is called (not just a caller convention), eGovChain anchor hashes `{citizenId, benefitId, matchedAt}` via `HashPort` (real `node:crypto` SHA-256 in `adapters-persistence`), eGov AI narration called strictly after the match decision (cosmetic only), eReport non-delivery is an explicit citizen-initiated call (no scheduling/polling)
- [x] In-memory benefit catalog adapter with 3 hardcoded seed benefits, each declaring its own DBM dataset + query (`packages/adapters-persistence/src/index.ts`: `createInMemoryBenefitCatalog`); in-memory `BenefitMatchRepository` and `HashPort` adapters alongside it
- [x] `apps/api` HTTP route composing the flow (`packages/adapters-http/src/index.ts`: `createBangonHttpHandlers` + `createFaceLivenessHttpHandlers`; mounted in `apps/api/src/main.ts` at `POST /bangon/liveness/session`, `GET /bangon/liveness/result/:token`, `POST /bangon/confirm-identity` (requires Face Liveness `sessionToken`/`sessionId`, looks up via `FaceLivenessPort`), `POST /bangon/matches`, `POST /bangon/matches/:id/{notify,disburse,anchor,explain}`, `POST /bangon/report-non-delivery`); case attach at `POST /cases/:id/documents`
- [x] Automated tests (`packages/application/src/use-cases/bangon-gates.test.ts` — attach-document, Face Liveness gate, eligibility case-normalization, LLM failure → `blocked`, success → `completed`)
- **Note on `anchorBenefitMatch`'s JSON-RPC method:** calls a placeholder method name (`egov_anchorHash`) not enumerated in `docs/platform-apis.md` — must be confirmed against the dashboard's live OpenAPI before use against the real chain (see "Align adapter path maps with live OpenAPI" below). Typechecked and unit-verifiable against a fake `EgovChainPort`, but not live-tested.

## Phase 2 — Orchestration line

- [x] Agent registry (Architect, Designer, Builder, Verifier, Ops) (`apps/orchestrator/src/agents/registry.ts`)
- [x] Mailbox runtime loop with correlation ids (`apps/orchestrator/src/main.ts`, `packages/application/src/use-cases/orchestration.ts`: `dispatchAgentTask`, `runAgentTurn`)
- [x] Stage pipeline: foundation → design → build → verify → ship (`PIPELINE_STAGES` iterated in `apps/orchestrator/src/main.ts`)
- [x] Human gate hook (`runAgentTurn` in `packages/application/src/use-cases/orchestration.ts`: on LLM failure writes `AgentTaskStatus: "blocked"` per `criteria.md`/`fallback.md`; on success writes `completed`; best-effort correlated by `taskId` from the mailbox payload — verified by test). `needs_human` remains reserved for SLA/deadlock escalation.
- [x] Wire orchestrator to `LlmPort` stub (`createStubLlmPort` in `@egov/adapters-ai`, wired in `apps/orchestrator/src/main.ts`); real provider adapter also exists (`createOllamaLlmPort`, env-configurable base URL/model, `Result`-based failure handling, never throws) — typechecked only, no live Ollama instance confirmed for this repo, and `apps/orchestrator/src/main.ts` still wires the stub, not Ollama, by default
- [x] Persist agent tasks (`createInMemoryAgentTaskRepository` in `@egov/adapters-persistence`) — in-memory only; durable persistence is Phase 3

## Phase 3 — Durable infrastructure

- [ ] Postgres adapter for repositories
- [ ] Migrations package / workflow
- [ ] Document store adapter (local FS or object storage)
- [ ] Queue-backed `EventBus` adapter
- [ ] Cutover checklist from in-memory → durable (see fallback.md)

## Phase 4 — Android client and auth

> **Client decision (2026-07-21):** BANGON's primary citizen surface is a **native Android app**, not a website. `apps/web` in this monorepo is an optional local/debug shell only — not the product UI. Phase 4 tracks the Android client + auth that consume `apps/api`.

- [ ] Android BANGON client consuming `apps/api` (cases + `/bangon/*` routes) — identity confirm, eligibility matches, notify/disburse/anchor/explain, non-delivery report
- [x] AuthN/Z port + adapter (citizen via eGov SSO) — `exchangeSsoToken` / `getSsoCitizenProfile` + `POST /auth/sso/exchange` + `POST /auth/sso/profile`; contract in `docs/api-android.md`. Staff roles / RBAC still open.
- [ ] Staff / reviewer surface for case review and orchestrator approvals (Android or thin internal tool — not a public marketing site)
- [ ] Citizen-facing case / match status in the Android app

## Phase 5 — Production line

- [ ] Environment config via ports (no secrets in repo)
- [ ] Structured logging and health/readiness probes
- [ ] Fallback drills documented and scheduled
- [ ] Criteria suite green in CI
- [ ] Deployment runbook (host, containers, or platform of choice)
- [ ] Observability: metrics for case latency, agent task outcomes, adapter errors

## Parking lot (decide explicitly)

- Multi-agency tenancy model  
- Document retention and scanning policy  
- Exact HTTP framework and ORM  
- Cloud vs on-prem LLM gateway  
- Android app packaging: in this monorepo vs separate Android repository  

Move items out of the parking lot into a numbered phase when decided.
