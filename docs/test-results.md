# Verified test results

Last verified: **2026-07-22** against eGovChain chain ID `13371` and the local/Vercel staging integration.

## Tolvaris DBM Compass duplicate-detection KPI

**Result: PASS — 7/7 correctness checks** across 15 read-only lookup iterations.

| KPI | Result |
|---|---:|
| Exact existing source record found | PASS |
| Exact missing source record rejected | PASS |
| Existing contextual fingerprint found | PASS |
| Missing contextual fingerprint rejected | PASS |
| Plaintext project read-back matched | PASS |
| Exact duplicate write simulation rejected | PASS |
| Same project under another source ID rejected | PASS |
| Exact-key lookup average / p95 | 124.83 ms / 206.69 ms |
| Contextual-fingerprint lookup average / p95 | 129.64 ms / 207.76 ms |
| Lookup p95 target | ≤ 2,000 ms |

The deployed synthetic project used the readable dataset `LGSF`, source record ID `SYNTHETIC-PROJECT-001`, a synthetic project title/location, and agency code `DBM-SAMPLE`. No real government project or personal data was written for this test.

Transparency registry deployment transaction: `0x5251e403a5bb3b628d9cd71352519226c6a30c67d6552a52faa7b13dad871210`

Synthetic project transaction: `0x68cd5cf35ad8e71f5a39e6913aa3c4159582c6fd7672904eeef3c14f7cae60d1` (block `157008`)

Synthetic budget snapshot transaction: `0xd7ce21477cdd5d6a0e64f1cd5640247f13c2c5d5be7bbe51338db9e9c87fb1d1` (block `157012`)

Re-run:

```bash
set -a
source .env
source .local/tolvaris-registry.env
set +a
pnpm kpi:tolvaris-transparency
```

## Tolvaris citizen-card ledger

**Result: PASS.** A synthetic `NATIONAL_ID` card type was anchored and read back from block `156644`. The chain record contained a pseudonymous owner commitment, plaintext card type, HMAC card fingerprint, and timestamp—no name, e-mail, mobile number, eGov subject ID, or raw card number.

Registry deployment transaction: `0xdf42c6b312b1a79985bdaf415fec29767d3f6f92c07fd945832030a6c623b9bc`

Synthetic card transaction: `0x29d1706704679f47d0a62f4a4509f0c966401d84ee837be4e01181fd5f78b4bc`

The credential/document self-service model adds four passing policy-gate tests: valid issuer/holder access, stale challenge plus low liveness rejection, image-without-consent rejection, and authenticated-holder mismatch rejection. Its Solidity registry also compiles successfully; it is an undeployed design artifact and is not represented as a live department integration.

## Application and client checks

| Check | Result |
|---|---:|
| Monorepo automated tests | PASS — 59/59 |
| TypeScript build/typecheck | PASS |
| Repository hygiene/secret check | PASS |
| Java Android debug APK build | PASS |
| APK server-secret scan | PASS — no partner secret, API secret, signer key, or HMAC secret |
| Chrome CDP staging warning | PASS — visible |
| Official eGovPH widget script | PASS — loaded |
| Official widget button | PASS — mounted with `Login with` |
| Local `/api/config` | PASS — `STAGING`, widget ID configured |
| Local card-ledger read | PASS — deployed synthetic card returned |

The APK is generated at `apps/android-sso-java/app/build/outputs/apk/debug/app-debug.apk` and contains only public client configuration plus the public Vercel backend URL.

## Safe nine-service platform smoke

**Result: 6 PASS, 3 SKIP, 0 FAIL.** eVerify authentication, eGov AI token/credits, eGovPay validation probe, eGovChain block read, eReport token/report types, and DBM Compass SAAODB read all passed. SSO was skipped because no fresh single-use exchange code was provided; Face Liveness and eMessage were skipped because safe mode does not create a biometric session or send a real message. Those skips are intentional and are not counted as passes.

## Synthetic general-ledger analytics

**Result: PASS.** Three synthetic agencies, three projects, three budget snapshots, and six double-entry journal entries were written to and read from eGovChain. All six entries balanced; the contract rejected a simulated unbalanced entry.

| KPI | Result |
|---|---:|
| Journal entries / lines | 6 / 12 |
| Total debit / credit | PHP 315,000,000 / PHP 315,000,000 |
| Trial-balance difference | PHP 0 |
| Accounting equation | PASS |
| Deterministic review signals | 3 |

General-ledger registry: `0x217AD680c000C66a84633Fc1c698C44c4a055B70`; deployment transaction: `0x0934aed7372e54c745120343336f2ee3aaeecb6ecc5803acd4bb56a6e448abb3`.

The review signals are deliberately planted synthetic inconsistencies, not allegations or legal findings. Full reusable output is in `data/mock-government-ledger.json` and `apps/web/public/data/mock-government-analytics.json`.

## Accountability registries

**Result: PASS — 10/10 read-back and privacy checks**, total parallel read-back time **205.72 ms**.

| Registry | Address | Deployment block | Verified record |
|---|---|---:|---|
| Benefit / eligibility / eMessage receipt | `0xcebC4bEaF86A06534644fbae7a776757dB98F098` | 158412 | program, pseudonymous eligibility, notification |
| eReport / external evidence | `0x41F18fEA3BAd560bDfd8d8cB9E1e8f368e84095c` | 158416 | report commitment, unverified media signal |
| eGovPay proof | `0x7E996e277505deab7deCf211e2e5C52268C18F19` | 158420 | private individual proof, public synthetic business proof |
| OCR/document proof | `0xb65D9982683b834a307a143Dd33C2c6CC96aC7e6` | 158424 | public synthetic government document |

The payment contract rejected plaintext individual fields, and the document contract rejected public metadata in private mode. Re-run the independent read-only verification with `pnpm kpi:accountability` after loading `.env` and `.local/tolvaris-registry.env`.

## Live eGov AI orchestration KPI

**Result: PASS — 9/9.** One main Assistant request successfully selected/ran Laws, Translator, and Speech; all selected tools returned output and the orchestration status was `ok`.

| Tool | Response time |
|---|---:|
| Token | 140.51 ms |
| Assistant | 9,179.48 ms |
| Laws | 12,490.72 ms |
| Translator | 11,607.01 ms |
| Speech | 12,265.58 ms |
| Total orchestration | 45,686.11 ms |

The provider's Credits endpoint reported 200 before and after this run. Prompts, generated responses, tokens, and credentials are excluded from the saved KPI report.

## Live Vercel/system KPI

**Result: PASS — 8/8 measured checks, 100% availability; 1 optional API-health check skipped** because `apps/api` has no deployed `EGOV_API_URL` yet. The stable production alias passed the SSO page/config/validation, card-ledger read, eGovChain chain ID, public-project lookup, transparency page, and synthetic analytics JSON checks under the 3,000 ms warm-response target.

Chrome CDP independently rendered the live transparency route with six KPI cards, three project cards, three review-signal rows, and the synthetic-data disclaimer. The first post-deployment cold homepage request took 3,198.39 ms and missed the target by 198.39 ms; the immediate warm verification passed at 2,540.59 ms. This cold-start observation is retained rather than hidden.
