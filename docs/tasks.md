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
- [ ] Add root `test` suite beyond platform smoke
- [ ] Add CI workflow for typecheck on PR

## Phase 0.5 — Platform verticals

- [ ] Validate SSO token + partner auth against hackathon SSO with dashboard credentials
- [ ] Validate eVerify auth + query + QR flows
- [ ] Face liveness session/result with `SUCCEEDED` && confidence ≥ 95.0 gate in a use case
- [ ] eMessage SMS push smoke test
- [ ] eGov AI token + one assistant call; decide composition vs local `LlmPort`
- [ ] eGovPay generate/get/void with HMAC digest verification
- [ ] eGovChain `eth_blockNumber` smoke via thin JSON-RPC port
- [ ] eReport datasets + submit/OTP path
- [ ] DBM Compass SAAODB/NCA/SARO/LGSF query smoke
- [ ] Align adapter path maps with live OpenAPI from the dashboard (no invented endpoints)
- [x] Add `pnpm smoke:platform` runner (safe probes by default; `--write` for side effects)

## Phase 1 — Core domain vertical

> **STANDBY (2026-07-21):** Judging criteria refinement and product use-case expansion (e.g. multi-agency modeling) are on hold until the operator lifts standby. The items below already built are noted as such; anything still unchecked should not be started without asking.

- [x] Flesh out `ServiceCase` invariants and transitions (`packages/domain/src/index.ts`: `createServiceCase`, `advanceServiceCase`, status machine) — `Citizen` and `CaseDocument` types exist but have no invariants/validation beyond their shape yet
- [x] Implement use cases: submit case, get case, advance status (`packages/application/src/use-cases/service-cases.ts`)
- [ ] Implement use case: attach document (`DocumentStore` port exists in `packages/application/src/ports/index.ts`; no use case or adapter wiring calls it yet)
- [ ] Contract tests for repository ports (in-memory) — no test files exist in the repo yet
- [x] HTTP adapters for case endpoints (`packages/adapters-http/src/index.ts`: `createCaseHttpHandlers` — submit/get/advance)
- [x] `apps/api` boots and serves health + case routes (`apps/api/src/main.ts`: `/health`, `POST /cases`, `GET /cases/:id`, `POST /cases/:id/advance`)

## Phase 2 — Orchestration line

- [x] Agent registry (Architect, Designer, Builder, Verifier, Ops) (`apps/orchestrator/src/agents/registry.ts`)
- [x] Mailbox runtime loop with correlation ids (`apps/orchestrator/src/main.ts`, `packages/application/src/use-cases/orchestration.ts`: `dispatchAgentTask`, `runAgentTurn`)
- [x] Stage pipeline: foundation → design → build → verify → ship (`PIPELINE_STAGES` iterated in `apps/orchestrator/src/main.ts`)
- [ ] `needs_approval` human gate hook — `needs_human` exists as an `AgentTaskStatus` value in `@egov/domain`, but nothing sets it or gates on it; `runAgentTurn` only propagates LLM failure as an error today
- [x] Wire orchestrator to `LlmPort` stub (`createStubLlmPort` in `@egov/adapters-ai`, wired in `apps/orchestrator/src/main.ts`) — Ollama adapter itself not yet built
- [x] Persist agent tasks (`createInMemoryAgentTaskRepository` in `@egov/adapters-persistence`) — in-memory only; durable persistence is Phase 3

## Phase 3 — Durable infrastructure

- [ ] Postgres adapter for repositories
- [ ] Migrations package / workflow
- [ ] Document store adapter (local FS or object storage)
- [ ] Queue-backed `EventBus` adapter
- [ ] Cutover checklist from in-memory → durable (see fallback.md)

## Phase 4 — Web and auth

- [ ] Vite React app shell consuming API
- [ ] AuthN/Z port + adapter (citizen / staff)
- [ ] Staff UI for case review and orchestrator approvals
- [ ] Citizen-facing case status view

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

Move items out of the parking lot into a numbered phase when decided.
