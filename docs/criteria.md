# Criteria

## Purpose

Acceptance criteria for the foundation and each delivery stage. A stage is done only when its criteria pass — not when an agent or developer says it is done.

> **STANDBY (2026-07-21):** Do not expand, rewrite, or treat incomplete Phase 1+ criteria as active gates until the operator lifts standby. Foundation Phase 0 criteria remain the structural reference; product judging stays frozen while the idea forms.

## Foundation criteria (Phase 0)

- [ ] Monorepo installs with `pnpm install` from repo root  
- [ ] Packages resolve via workspace protocol (`@egov/*`)  
- [ ] `domain` has zero imports from adapters or apps  
- [ ] Application defines ports as interfaces; no concrete infra in use cases  
- [ ] At least one in-memory adapter implements each critical port (repo, EventBus, LlmPort, AgentMailbox)  
- [ ] `apps/api` and `apps/orchestrator` compose without circular deps  
- [ ] Docs set exists and matches the tree: architecture, design, fallback, tasks, boundaries, criteria, platform-apis  
- [ ] Platform ports exist for SSO, eVerify, Face Liveness, eMessage, eGov AI, eGovPay, eGovChain, eReport, DBM Compass  
- [ ] `@egov/adapters-egov-platform` implements those ports; secrets only via env (see `.env.example`)  

## Platform criteria (Phase 0.5)

- [ ] Face liveness `passed` is true only when status is `SUCCEEDED` and confidence ≥ 95.0  
- [ ] Missing env credentials return `UNAVAILABLE` (no silent empty success)  
- [ ] eGovChain port exposes generic `call` plus thin `eth_*` helpers (not a 60-method dump)  
- [ ] No platform secrets committed to git  

## Domain / application criteria (Phase 1)

- [ ] Invalid `ServiceCase` transitions are rejected by domain logic  
- [ ] Submit / get / attach / advance use cases succeed against in-memory ports  
- [ ] Duplicate submit with same idempotency key returns the same case  
- [ ] Adapter contract tests cover happy path + not-found + unavailable  

## HTTP criteria

- [ ] Health endpoint returns process liveness  
- [ ] Case endpoints map domain/application errors to correct HTTP status families  
- [ ] No stack traces or secrets in client-facing error bodies  

## Orchestration criteria (Phase 2)

- [ ] Agent messages include `from`, `to`, `stage`, `correlationId`  
- [ ] Pipeline stages run in order: foundation → design → build → verify → ship  
- [ ] On LLM failure, task becomes `blocked` (see fallback.md), not silently skipped  
- [ ] Deadlock or max verify rounds → `needs_human`  
- [ ] No agent writes case status without going through application use cases  

## Production readiness criteria (Phase 5)

- [ ] Secrets loaded only from environment / secret store  
- [ ] Readiness distinguishes “alive” vs “deps healthy”  
- [ ] Fallback drills for LLM and persistence documented with last-run date  
- [ ] Criteria suite runs in CI on main and PRs  
- [ ] Rollback path documented for the active deployment method  

## Definition of done (any task)

A change is done when:

1. It respects [boundaries.md](./boundaries.md)  
2. Relevant criteria above are green or explicitly deferred in [tasks.md](./tasks.md)  
3. Fallback behavior for new failure modes is documented if introduced  
4. Types build clean for touched packages  

## Anti-criteria (do not accept)

- “Works on my machine” without typecheck  
- Domain rules only enforced in the UI  
- Agent chat used as the system of record  
- Merging adapters that bypass ports “just for now” without a dated exception  
