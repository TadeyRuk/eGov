# eGov SSO staging backend

Vercel provides the staging server-side boundary for the official eGov SSO widget. It stores the partner code and partner secret as encrypted project environment variables; the web page and Android client receive neither value.

Set the Vercel project's **Root Directory** to `apps/web`. That directory contains the static site, `/api/config`, `/api/auth/egov/exchange`, and its own `vercel.json`.

`POST /api/auth/egov/exchange` accepts `{ "code": "<one-time exchange code>", "anchorCards": true }`, exchanges it with eGov, requests the authenticated citizen profile, and returns `{ "authenticated": true, "profile": { ... }, "ledger": { ... } }`. Card anchoring is opt-in in the test UI. The function has no database, cache, session store, or application logging.

Required Vercel environment variables:

```text
EGOV_SSO_BASE_URL=https://hackathon-sso.e.gov.ph
EGOV_SSO_PARTNER_CODE=<registered partner code>
EGOV_SSO_PARTNER_SECRET=<registered partner secret>
EGOV_SSO_CLIENT_ID=<public widget client ID, if distinct from partner code>
EGOV_SSO_SCOPE=SSO_AUTHENTICATION
EGOVCHAIN_RPC_URL=https://hackathon-blockchain.e.gov.ph
EGOVCHAIN_CHAIN_ID=13371
TOLVARIS_REGISTRY_ADDRESS=<deployed contract address>
EGOVCHAIN_SIGNER_PRIVATE_KEY=<server-only registrar key>
TOLVARIS_OWNER_HMAC_SECRET=<server-only random secret>
```

The deployment is a test backend when the base URL and widget environment are `STAGING`, even if Vercel labels its stable URL as a Production deployment. Only minimum profile fields are returned to the clients; the full platform response and temporary bearer token are not exposed.

## Tolvaris card ledger

`TolvarisCardRegistry` is a central on-chain index of the card types associated with a pseudonymous eGov user. It stores:

- `ownerCommitment`: an HMAC-SHA-256 commitment derived server-side from the eGov `uniqid`;
- `cardType`: a readable code such as `NATIONAL_ID`, `TIN_ID`, or `PASSPORT`;
- `cardFingerprint`: an HMAC-SHA-256 fingerprint of the card payload; and
- `anchoredAt`: the block timestamp.

Names, e-mail addresses, eGov subject IDs, card numbers, and document contents are never written to the chain. HMAC is used here for pseudonymization and integrity, not reversible encryption. The authenticated backend is the only component that maps the current eGov account to its owner commitment.

Deploy and run a synthetic write/read roundtrip with:

```bash
set -a
source .env
set +a
node tooling/deploy-tolvaris-registry.mjs
```

The command writes registrar credentials and the deployed address only to ignored `.local/tolvaris-registry.env`. `GET /api/cards?ownerCommitment=0x...` reads the public ledger records for an already-known commitment.
