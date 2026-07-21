# Design

## Product intent

eGov delivers digital government services through a maintainable, testable core. AI orchestration accelerates delivery (foundation → production) without becoming a silent authority over citizen data or policy.

## Design principles

1. **Domain first** — model citizens, service cases, and documents before choosing frameworks.  
2. **Ports over products** — every external system is a replaceable adapter.  
3. **Thin apps** — composition roots wire; they do not invent business rules.  
4. **Explicit failure** — use `Result` / typed errors; avoid thrown surprises at package boundaries.  
5. **Human-gated AI** — agents propose; approved pipelines apply.  
6. **One job per package** — if a package has two reasons to change, split it.

## Domain sketch

Initial bounded concepts (expand as real agency requirements arrive):

| Concept | Meaning |
|---------|---------|
| `Citizen` | Person interacting with a service (identity refs are opaque ids) |
| `ServiceCase` | A filed request with lifecycle status |
| `CaseDocument` | Artifact attached to a case |
| `Agency` | Owning organization for a service catalog entry |
| `AgentTask` | Orchestrator work item with stage, owner agent, status |

### Service case lifecycle

```
draft → submitted → in_review → approved | rejected → closed
```

Transitions are enforced in the domain. Adapters must not invent statuses.

## Package design

### `@egov/shared`

- `Result<T, E>`, `AppError`, branded `Id` helpers  
- No government domain types (those live in domain)

### `@egov/domain`

- Entities and value objects with invariants  
- Domain events (`ServiceCaseSubmitted`, `AgentTaskCompleted`, …)  
- Pure functions / methods only — no I/O

### `@egov/application`

- Use cases: `SubmitServiceCase`, `AttachDocument`, `AdvanceCaseStatus`, `DispatchAgentTask`  
- Port interfaces only (no concrete clients) — including **official eGov platform ports** in `ports/platform.ts`  
- Orchestration of domain objects + ports

### Adapters

- **persistence** — repository implementations; start with in-memory maps  
- **http** — request DTO → use case → response DTO  
- **ai** — `LlmPort` + `AgentMailbox` with a local/stub provider  
- **messaging** — in-memory pub/sub matching `EventBus`  
- **egov-platform** — `@egov/adapters-egov-platform` implements SSO, eVerify, Face Liveness, eMessage, eGov AI, eGovPay, eGovChain, eReport, DBM Compass against real base URLs (see [platform-apis.md](./platform-apis.md))

### Official platform integration design

1. Application depends only on port interfaces (`EgovSsoPort`, `EVerifyPort`, …).  
2. Apps compose `createEgovPlatformAdapters(processEnv())`.  
3. Secrets come exclusively from env / dashboard — never hardcoded.  
4. Response bodies stay as `raw` JSON until product brief defines typed DTOs.  
5. Face liveness is verified only when `SUCCEEDED` and confidence `≥ 95.0` (`isFaceLivenessPassed`).  
6. eGovChain stays a thin JSON-RPC port (`call` + a few `eth_*` helpers), not a 60-method dump.  

Do not invent alternate government identity/payment APIs when these platform services cover the need.

### Apps

| App | Design note |
|-----|-------------|
| `api` | Express/Fastify (or equivalent) chosen at composition time; keep framework out of application |
| `web` | Vite + React shell; consume API contracts only |
| `orchestrator` | Agent registry, mailbox loop, stage pipeline; no domain mutations without going through application use cases |

## Multi-AI orchestration design

Agents are roles with narrow charters:

| Agent | Stage | Charter |
|-------|-------|---------|
| `Architect` | foundation | Propose structure, ports, package splits |
| `Designer` | design | Refine domain models and API shapes |
| `Builder` | build | Draft code changes against ports |
| `Verifier` | verify | Check criteria and boundaries |
| `Ops` | ship | Production checklist, fallback drills |

Communication rules:

- Agents talk only through `AgentMailbox` (no shared mutable globals).  
- Every message has `from`, `to`, `stage`, `payload`, `correlationId`.  
- Shared facts go on an `EventBus` or task board, not in chat side-channels.  
- Escalation to a human gate is a first-class outcome (`needs_approval`).

## API surface (initial)

Inbound (illustrative):

- `POST /cases` — submit service case  
- `GET /cases/:id` — fetch case  
- `POST /cases/:id/documents` — attach document  
- `POST /orchestrator/tasks` — enqueue agent task (staff / internal)

Outbound ports stay private to the process; they are not HTTP endpoints.

## Testing strategy

| Level | What | Where |
|-------|------|-------|
| Unit | Domain invariants, use cases with fake ports | `packages/domain`, `packages/application` |
| Adapter | Contract tests against port interfaces | each `adapters-*` |
| App | Smoke wiring of composition root | `apps/api`, `apps/orchestrator` |
| Criteria | Acceptance checks from `criteria.md` | CI later |

Prefer fakes over mocks: implement the port in-memory.

## Tech choices (foundation defaults)

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Language | TypeScript (ESM) | Shared types across apps and adapters |
| Monorepo | pnpm workspaces | Strict package boundaries, fast installs |
| Build | `tsc` project references | Simple, no premature bundler complexity in packages |
| Runtime AI | Adapter behind `LlmPort` | Swap Ollama / cloud / gateway without touching use cases |
| Persistence | In-memory → Postgres | Prove ports before schema lock-in |

These defaults can change at the adapter/app edge without rewriting domain or application.

## Open design slots

Documented intentionally for later commits — do not invent silently:

- AuthN/Z model (citizen vs staff vs system)  
- Multi-agency tenancy  
- Document virus scanning / retention policy  
- Exact HTTP framework and ORM  

Track them in [tasks.md](./tasks.md).
