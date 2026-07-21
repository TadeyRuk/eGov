# Tolvaris ledger data model

Tolvaris uses two separate registries because citizen ownership and government-project transparency have opposite disclosure rules.

## 1. Citizen card registry

| Field | Storage form | Reason |
|---|---|---|
| eGov user / owner | HMAC commitment | Pseudonymous lookup without publishing identity |
| Card type (`NATIONAL_ID`, `TIN_ID`, `PASSPORT`) | Plaintext | Lets the owner see which card categories are anchored |
| Card number and card payload | Never on-chain | Personal data; retain only inside the authenticated eGov flow |
| Card fingerprint | HMAC commitment | Detects the same card without exposing its number/content |
| Name, e-mail, mobile | Never on-chain | Not required to prove card ownership |

`TolvarisCardRegistry.sol` is append-only and registrar-written. The authenticated backend derives the owner commitment from eGov `uniqid`; the browser never receives the HMAC secret.

## 2. DBM Compass public-project registry

The normalized relationship is:

```text
Agency (1) ──< Project (1) ──< BudgetSnapshot
```

| Normalized record | Natural key | Plaintext public fields |
|---|---|---|
| `Agency` | `agencyCode` | code, official agency name |
| `Project` | `dataset + sourceRecordId` | dataset, source record ID, title, location, agency code, implementing unit, source URL |
| `BudgetSnapshot` | `projectKey + snapshotIndex` | fiscal year, as-of date, appropriations, allotments, obligations, disbursements, status, recorded time |

Amounts are integers in centavos to avoid floating-point ambiguity. Each new DBM reporting period appends a snapshot instead of overwriting history. `sourcePayloadHash` is an additional integrity proof; it does not replace the plaintext fields.

### Duplicate checks and hash indexes

Use two small, purpose-specific indexes instead of hashing every field into the project identity:

| Index | Hashed input | Use |
|---|---|---|
| Exact source key | `dataset + sourceRecordId` | `hasProject(...)` checks whether that exact DBM row was already published |
| Project fingerprint | `dataset + agencyCode + canonicalTitle + canonicalLocation` | Detects the same contextual project under another source row ID |
| Payload hash | Canonical JSON of the complete source row | Detects whether the contents/version changed; not used as project identity |

Before computing a project fingerprint, trim leading/trailing spaces, collapse repeated whitespace, and uppercase the title/location/agency code. Do not include amount, status, reporting date, or other snapshot fields in the fingerprint because those legitimately change over time. The readable fields remain plaintext; the fingerprint is only a fast duplicate index.

### Plaintext policy

These should remain plaintext because they describe public government expenditure: agency/entity, project/program title, project location, implementing unit, fiscal/reporting period, fund source/class, public DBM reference identifiers, appropriations, releases/allotments, obligations, disbursements, balances, implementation status, and official source URL.

These are not transparency fields and must stay out of the public chain: `X-API-Key`, private keys, access tokens, passwords, bank/account details, private signatures, internal security metadata, and any personal name/contact/ID that appears incidentally in a source payload. Redact such fields before publishing. Encryption is not a reliable way to make immutable public-chain data private forever; protected values belong off-chain.

The contract is `contracts/TolvarisPublicProjectRegistry.sol`. Deploy it and run a fully synthetic plaintext write/read roundtrip with:

```bash
set -a
source .env
source .local/tolvaris-registry.env
set +a
node tooling/deploy-tolvaris-transparency-registry.mjs
```

Run the read-only showcase KPI after deployment:

```bash
set -a
source .env
source .local/tolvaris-registry.env
set +a
pnpm kpi:tolvaris-transparency
```

The KPI reports exact-key and contextual-fingerprint hit/miss correctness, duplicate-write rejection using transaction simulation, plaintext read-back correctness, and average/p95 lookup latency. Its default pass target is all seven correctness checks plus p95 at or below 2 seconds for both lookup modes.
