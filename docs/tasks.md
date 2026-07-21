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
- [x] Add root scripts: `build`, `typecheck`, `test` (read-only eGovChain smoke)
- [ ] Add CI workflow for typecheck on PR

## Phase 0.5 — Platform verticals

- [x] Validate SSO token + partner auth using the dashboard's designated hackathon test identity and single-use exchange code
- [ ] Validate eVerify auth + query + QR flows
- [ ] Face liveness session/result with `SUCCEEDED` && confidence ≥ 95.0 gate in a use case
- [ ] eMessage SMS push smoke test
- [x] eGov AI token + one assistant call; current hackathon API is prompt-based and returns text + session id
- [ ] eGovPay generate/get/void with HMAC digest verification
- [x] eGovChain `eth_blockNumber` smoke via thin JSON-RPC port
- [ ] eReport datasets + submit/OTP path
- [ ] DBM Compass SAAODB/NCA/SARO/LGSF query smoke
- [ ] Align adapter path maps with live OpenAPI from the dashboard (no invented endpoints)

## Phase 1 — Core domain vertical

- [ ] Flesh out `Citizen`, `ServiceCase`, `CaseDocument` invariants and transitions
- [ ] Implement use cases: submit case, get case, attach document, advance status
- [ ] Contract tests for repository ports (in-memory)
- [ ] HTTP adapters for case endpoints
- [ ] `apps/api` boots and serves health + case routes

## Phase 2 — Orchestration line

- [ ] Agent registry (Architect, Designer, Builder, Verifier, Ops)
- [ ] Mailbox runtime loop with correlation ids
- [ ] Stage pipeline: foundation → design → build → verify → ship
- [ ] `needs_approval` human gate hook
- [ ] Wire orchestrator to `LlmPort` stub, then Ollama adapter
- [ ] Persist agent tasks (when persistence is durable)

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
