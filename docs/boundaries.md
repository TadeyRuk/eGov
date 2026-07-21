# Boundaries

## Purpose

Hard rules for what may depend on what, who may mutate what, and where AI stops. Violations are defects, not style nits.

## Package dependency rules

```
apps → adapters → application → domain
                 ↘ shared ↗
```

| From | May import | Must not import |
|------|------------|-----------------|
| `domain` | `shared` (optional, carefully) | application, adapters, apps |
| `application` | `domain`, `shared` | adapters, apps, frameworks |
| `adapters-*` | `application` (ports), `domain` (types), `shared` | other apps; unrelated adapters unless via shared events |
| `apps/*` | any package (composition root) | — |
| Android BANGON client | `apps/api` HTTP only | persistence, ai, messaging, egov-platform, domain packages |
| `web` (debug shell only) | API contracts / shared DTOs only | persistence, ai, messaging adapters; must not be treated as product UI |

### Forbidden patterns

- Domain importing Express, React/Android UI kits, Prisma, fetch, Ollama, or eGov platform URLs  
- Use cases constructing `new PostgresCitizenRepository()` or calling `fetch("https://hackathon-…")`  
- Circular imports between packages  
- “Shared” dumping ground for domain entities  
- Hardcoding partner secrets, API keys, or HMAC secrets (use env from the dashboard only)  
- Inventing fake government APIs when an official platform service exists ([platform-apis.md](./platform-apis.md))
- Building the citizen product as a public website in `apps/web` (Android is primary; see [tasks.md](./tasks.md) Phase 4)

## Runtime boundaries

| Actor | May | Must not |
|-------|-----|----------|
| HTTP adapter | Map DTO ↔ use case I/O | Embed business invariants |
| Use case | Call ports + domain | Talk to DB/HTTP/LLM/platform SDKs directly |
| Domain entity | Enforce invariants | Perform I/O |
| `@egov/adapters-egov-platform` | Implement platform ports with `fetch` + env | Own business rules or store secrets in code |
| Orchestrator agent | Propose via mailbox / draft artifacts | Approve cases or write citizen PII as truth without a use case + human gate |
| Android BANGON client | Call `apps/api` | Hold platform partner secrets, call eGov platform URLs directly, or embed domain eligibility rules |
| `apps/web` debug shell | Call API for local probing | Act as the citizen product UI |

## Data boundaries

- **PII** stays behind application use cases; agents receive redacted or synthetic context unless an explicit policy says otherwise.  
- **Documents** move only through `DocumentStore` port.  
- **Events** are facts that already happened in the domain/application; agents do not invent domain events.  
- **Platform identity / payment / verify results** enter the system only through platform ports; raw JSON is untrusted until mapped by a use case.

## AI / orchestration boundaries

1. Agents communicate only through `AgentMailbox`.  
2. Agents do not share mutable process state.  
3. Production mutations require an application use case.  
4. `needs_approval` is mandatory for ship-stage and for any change that alters case outcomes.  
5. LLM output is untrusted input until verified against [criteria.md](./criteria.md).

## Team / process boundaries

| Concern | Owner |
|---------|-------|
| Domain invariants | Domain package + reviewers |
| Port shapes | Application package |
| Adapter choice | Platform / apps composition |
| Criteria changes | Require docs PR updating `criteria.md` |
| Boundary exceptions | Temporary, time-boxed, recorded in this file |

## Changing a boundary

1. Propose in a PR that updates this file and `architecture.md`.  
2. Add or adjust an automated check when feasible (lint, dep-cruiser, CI).  
3. Do not “temporarily” import the wrong direction without a dated exception entry below.

## Active exceptions

_None._
