# eGov

Modular Philippine e-government **SuperApp** monorepo: hexagonal ports/adapters, a multi-agent orchestration line, and outbound adapters for all **9** official [eGov API Platform](https://platforms.e.gov.ph/dashboard) services.

**Ground truth for structure:** [docs/architecture.md](docs/architecture.md) (what is built vs aspirational).  
**Hackathon pitch / long-term narrative:** [eGov_PH_SuperApp_System_Architecture.md](eGov_PH_SuperApp_System_Architecture.md).

## Product direction (target — not yet built)

Documented under **Product Vision** in [docs/architecture.md](docs/architecture.md):

| Theme | Intent | Build status |
|-------|--------|----------------|
| **BANGON** | Proactive benefit-matching: DBM fund check → Face + eVerify → eligibility search → eMessage / eGovPay / eGovChain (eReport on miss; eGov AI for plain-language help) | Not a single use case yet; ports exist individually; **eligibility-search port still undesigned** |
| Multi-agency PSA cascade | PhilSys update propagates across agencies (zero-redundancy onboarding) | Not built — `ServiceCase` is single-agency today |
| Scale / nationwide | 100M+ tx/week design target; barangay → national surface | Narrative only for hackathon scope |

Do not treat vision bullets as implemented features.

## Foundation docs

| Doc | Role |
|-----|------|
| [docs/architecture.md](docs/architecture.md) | Layers, ports, apps, flows, **current vs Product Vision** |
| [docs/design.md](docs/design.md) | Principles, domain sketch, agent roles |
| [docs/platform-apis.md](docs/platform-apis.md) | eGov API Platform reference (all 9 services) |
| [docs/boundaries.md](docs/boundaries.md) | Hard dependency and AI rules |
| [docs/fallback.md](docs/fallback.md) | Degradation and fail-safe paths |
| [docs/criteria.md](docs/criteria.md) | Acceptance gates per phase |
| [docs/tasks.md](docs/tasks.md) | Ordered backlog foundation → production |
| [eGov_PH_SuperApp_System_Architecture.md](eGov_PH_SuperApp_System_Architecture.md) | Pitch / SuperApp specification (aspirational) |

## Platform integrations (current)

Outbound ports in `@egov/application` (`ports/platform.ts`), implemented by `@egov/adapters-egov-platform`:

| Port | Service |
|------|---------|
| `EgovSsoPort` | eGov SSO |
| `EVerifyPort` | eVerify |
| `FaceLivenessPort` | Face Liveness |
| `EMessagePort` | eMessage SMS |
| `EgovAiPort` | eGov AI |
| `EgovPayPort` | eGovPay |
| `EgovChainPort` | eGovChain JSON-RPC |
| `EReportPort` | eReport |
| `DbmCompassPort` | DBM Compass |

Credentials come **only** from the dashboard. Copy [`.env.example`](.env.example) → `.env` and fill placeholders. Never commit secrets.

## Monorepo layout

```
apps/
  api/              # HTTP composition root
  web/              # UI shell (citizen / staff)
  orchestrator/     # multi-agent delivery line
packages/
  domain/           # entities & invariants (no I/O)
  application/      # use cases + ports (incl. platform ports)
  shared/           # Result, errors, ids
  adapters-http/
  adapters-persistence/
  adapters-ai/
  adapters-messaging/
  adapters-egov-platform/  # official eGov platform fetch adapters
docs/
tooling/            # tsconfig, hygiene check
```

**Dependency rule:** `apps → adapters → application → domain` (see [docs/boundaries.md](docs/boundaries.md)). Domain never imports adapters.

## Quick start

```bash
# if pnpm is not on PATH:
npx pnpm@9.15.0 install
npx pnpm@9.15.0 typecheck

# secrets + tracked-file hygiene
pnpm hygiene

# live platform adapter smoke (needs `.env` from dashboard)
pnpm smoke:platform
# optional side effects: Face session / SMS / Pay generate
# pnpm smoke:platform -- --write

pnpm --filter @egov/api dev
pnpm --filter @egov/orchestrator dev
```

Requires Node 20+ and [pnpm](https://pnpm.io) 9.x. Copy [`.env.example`](.env.example) → `.env` (never commit `.env`).

## Status

- **Now:** Phase 0 foundation — hexagonal monorepo, in-memory stubs, all 9 platform ports/adapters (env-backed fetch), hygiene + `smoke:platform`. See [docs/tasks.md](docs/tasks.md).
- **Next (architecture):** Wire use cases to SSO / eVerify / Pay; harden AI / eReport path maps against dashboard OpenAPI; design BANGON eligibility-search before inventing a port.
- **Not built:** BANGON composite workflow, PSA cascade, Postgres / queue scale path.
