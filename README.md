# eGov

Modular electronic-government platform with hexagonal architecture, a multi-agent orchestration line, and outbound adapters for the official [eGov API Platform](https://platforms.e.gov.ph/dashboard).

## Foundation docs

| Doc | Role |
|-----|------|
| [docs/architecture.md](docs/architecture.md) | Layers, ports, apps, flows |
| [docs/design.md](docs/design.md) | Principles, domain sketch, agent roles |
| [docs/platform-apis.md](docs/platform-apis.md) | eGov API Platform reference (all 9 services) |
| [docs/boundaries.md](docs/boundaries.md) | Hard dependency and AI rules |
| [docs/fallback.md](docs/fallback.md) | Degradation and fail-safe paths |
| [docs/criteria.md](docs/criteria.md) | Acceptance gates per phase |
| [docs/tasks.md](docs/tasks.md) | Ordered backlog foundation → production |

## Platform integrations

Outbound ports (implemented by `@egov/adapters-egov-platform`):

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
  web/              # UI shell
  orchestrator/     # multi-AI agent runtime
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
tooling/tsconfig/
```

**Dependency rule:** `apps → adapters → application → domain` (see boundaries).

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

Phase 0 foundation + platform port/adapter scaffolding. See [docs/tasks.md](docs/tasks.md).
