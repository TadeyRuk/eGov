# Fallback

## Purpose

Define what the system does when preferred paths fail — infrastructure, adapters, AI agents, or human process. Fallbacks keep eGov operable and trustworthy.

## Principles

1. **Degrade, don't invent** — if a dependency is down, return a clear failure or a reduced mode; never fabricate citizen or case data.  
2. **Fail toward safety** — prefer read-only or queued modes over incorrect writes.  
3. **One hop** — each failure has a named next action; avoid cascading silent retries.  
4. **Observable** — every fallback path emits a structured log / event.

## Adapter fallbacks

| Preferred | Failure | Fallback |
|-----------|---------|----------|
| Postgres persistence | DB unreachable | Refuse writes with `PersistenceUnavailable`; allow health endpoint to report degraded |
| Object/document store | Store unreachable | Reject attach with `DocumentStoreUnavailable`; keep case metadata intact |
| Message broker | Broker down | Buffer in-process only for non-critical events; critical events fail closed |
| External identity provider | IdP down | Block authenticated mutations; public health still responds |
| LLM provider (Ollama/cloud) | Timeout / 5xx | Return `LlmUnavailable`; orchestrator marks task `blocked` — no auto-fake answers |
| Secondary LLM | Primary down | Optional configured secondary via same `LlmPort` adapter chain |

## Orchestrator fallbacks

| Situation | Fallback |
|-----------|----------|
| Agent does not reply within SLA | Requeue once, then `needs_human` |
| Agents deadlock (A waits on B waits on A) | Cancel cycle; open human gate with transcript |
| Verifier rejects Builder output | Return to Builder with criteria diff; max N rounds then escalate |
| Mailbox full / poisoned message | Dead-letter the message; continue other tasks |
| Orchestrator process crash | On restart, rebuild from durable task board (when persistence exists); until then, mark in-flight tasks lost and require re-enqueue |

## Application fallbacks

| Situation | Fallback |
|-----------|----------|
| Invalid domain transition | Reject with domain error; no partial status write |
| Duplicate submission id | Idempotent return of existing case |
| Missing required document | Reject advance; keep case in current status |
| Partial multi-step use case | No silent half-commit; use single transactional boundary when persistence supports it |

## Operational fallbacks

| Situation | Fallback |
|-----------|----------|
| API process down | Load balancer / process manager restart; clients retry with backoff |
| Web UI cannot reach API | Show offline banner; no optimistic fake success |
| Secrets missing at boot | Refuse to start; fail fast in composition root |
| Disk full / OOM | Process exit; supervisor restart; alert |

## What we never fall back to

- Inventing case approvals or citizen identity  
- Skipping criteria checks because an agent “sounded confident”  
- Writing domain state from an agent chat message without a use case  
- Swallowing errors as empty 200 responses  

## Local / foundation mode

Until real infrastructure exists:

- In-memory adapters are the **primary** path, not a fallback.  
- Document that data is ephemeral.  
- When switching to durable adapters, run a dual-read or cutover checklist from [tasks.md](./tasks.md).

## Drill checklist

Periodically verify:

1. Kill LLM adapter → tasks become `blocked`, API core still serves cases.  
2. Kill messaging → case writes still succeed if not event-dependent; events report degraded.  
3. Invalid status transition → 4xx domain error, DB unchanged.  
4. Orchestrator restart → no corrupt half-applied agent “decisions”.

Record drill results next to releases.
