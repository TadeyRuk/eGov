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

## Application and client checks

| Check | Result |
|---|---:|
| Monorepo automated tests | PASS — 44/44 |
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
