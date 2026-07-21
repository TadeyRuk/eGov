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

> **Operator-confirmed (2026-07-21):** all 9 platform smoke checks below pass via `pnpm smoke:platform` against live sandbox credentials. Confirmed by the operator directly in-session; not independently re-verified by reading live call output in this session (Claude does not have live network/credential access in this environment) — see `docs/tasks.md`'s completion-readout convention.

- [x] Validate SSO token + partner auth against hackathon SSO with dashboard credentials (operator-confirmed)
- [x] Validate eVerify auth + query + QR flows (operator-confirmed)
- [x] Face liveness session/result with `SUCCEEDED` && confidence ≥ 95.0 gate in a use case (operator-confirmed; gate logic itself also independently verified this session via `isFaceLivenessPassed` + `confirmCitizenIdentity`'s test)
- [x] eMessage SMS push smoke test (operator-confirmed)
- [x] eGov AI token + one assistant call; decide composition vs local `LlmPort` (operator-confirmed reachable; composition decision: `EgovAiPort` used directly for BANGON narration, `LlmPort`/Ollama kept separate for orchestrator agents — not unified)
- [x] eGovPay generate/get/void with HMAC digest verification (operator-confirmed)
- [x] eGovChain `eth_blockNumber` smoke via thin JSON-RPC port (operator-confirmed)
- [x] eReport datasets + submit/OTP path (operator-confirmed)
- [x] DBM Compass SAAODB/NCA/SARO/LGSF query smoke (operator-confirmed)
- [ ] Align adapter path maps with live OpenAPI from the dashboard (no invented endpoints) — still open; `anchorBenefitMatch`'s JSON-RPC method name is a known placeholder pending this (see Phase 1 BANGON section)
- [x] Add `pnpm smoke:platform` runner (safe probes by default; `--write` for side effects)

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
- [x] `apps/api` HTTP route composing the flow (`packages/adapters-http/src/index.ts`: `createBangonHttpHandlers`; mounted in `apps/api/src/main.ts` at `POST /bangon/confirm-identity`, `POST /bangon/matches`, `POST /bangon/matches/:id/{notify,disburse,anchor,explain}`, `POST /bangon/report-non-delivery`)
- [x] Automated tests (`packages/application/src/use-cases/bangon-gates.test.ts` — 5 tests: attach-document happy/not-found paths, Face Liveness gate reject/pass, `needs_human` on LLM failure)
- **Note on `anchorBenefitMatch`'s JSON-RPC method:** calls a placeholder method name (`egov_anchorHash`) not enumerated in `docs/platform-apis.md` — must be confirmed against the dashboard's live OpenAPI before use against the real chain (see "Align adapter path maps with live OpenAPI" below). Typechecked and unit-verifiable against a fake `EgovChainPort`, but not live-tested.

## Phase 2 — Orchestration line

- [x] Agent registry (Architect, Designer, Builder, Verifier, Ops) (`apps/orchestrator/src/agents/registry.ts`)
- [x] Mailbox runtime loop with correlation ids (`apps/orchestrator/src/main.ts`, `packages/application/src/use-cases/orchestration.ts`: `dispatchAgentTask`, `runAgentTurn`)
- [x] Stage pipeline: foundation → design → build → verify → ship (`PIPELINE_STAGES` iterated in `apps/orchestrator/src/main.ts`)
- [x] `needs_approval` human gate hook (`runAgentTurn` in `packages/application/src/use-cases/orchestration.ts`: on LLM failure, writes `AgentTaskStatus: "needs_human"` via `AgentTaskRepository`, best-effort correlated by `taskId` extracted from the mailbox payload — verified by test)
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
- [ ] AuthN/Z port + adapter (citizen via eGov SSO; staff roles if needed for review)
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
