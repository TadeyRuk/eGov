# eGov API Platform

Official API reference for integrating with the Philippine **eGov API Platform**.

| | |
|--|--|
| **Dashboard (credentials)** | [https://platforms.e.gov.ph/dashboard](https://platforms.e.gov.ph/dashboard) |
| **Secrets** | Partner codes, API keys, tokens, and HMAC secrets are issued **only** from the dashboard. Copy placeholders into `.env` from `.env.example`. **Never commit secrets.** |

This document catalogs the nine platform services below. Do not invent endpoints beyond what is listed here.

---

## Index

| # | Service | Base URL | Auth summary |
|---|---------|----------|--------------|
| 1 | [eGov SSO](#1-egov-sso) | `https://hackathon-sso.e.gov.ph` | Partner code/secret → Bearer token |
| 2 | [eVerify](#2-everify) | `https://hackathon-everify-api.e.gov.ph` | `POST /api/auth` → Bearer `data.access_token` |
| 3 | [eMessage](#3-emessage) | `https://ws-message.e.gov.ph` | Header `X-EMESSAGE-Auth` |
| 4 | [eGov AI](#4-egov-ai) | `https://egov-ai-core-ws.oueg.info` | `access_code` → Bearer `access_token` |
| 5 | [eGovPay](#5-egovpay) | `https://egovpay-pgi-ws-dev.oueg.info` | `X-eGovPay-Token`; generate body `digest` = HMAC-SHA256(`$amount|$txnid`, token) |
| 6 | [eGovChain](#6-egovchain) | `https://hackathon-blockchain.e.gov.ph` | JSON-RPC 2.0 (chain id `13371`) |
| 7 | [eReport](#7-ereport) | `https://stg-ereport-ws.oueg.info` | Token + OTP flows |
| 8 | [Face Liveness](#8-face-liveness) | `https://hackathon-face-liveness-api.e.gov.ph` | Platform token / API key from dashboard |
| 9 | [DBM Compass](#9-dbm-compass) | `https://dbm-ws.oueg.info` | Header `X-API-Key`; `GET /api/v1/records/…` |

Related UI (not an API port): blockchain explorer `https://hackathon-explorer.e.gov.ph`

---

## 1. eGov SSO

**Purpose:** Single Sign-On for eGov partners — OAuth 2.0 authorization-code style flow. After the citizen authenticates, eGovPH appends an `exchange_code` to the partner callback URL; the partner backend exchanges that code for an access token, then loads the citizen profile.

**Base URL:** `https://hackathon-sso.e.gov.ph`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/api/token` | Partner credentials in **body** | Exchanges `exchange_code` for `access_token` |
| `POST` | `/api/partner/sso_authentication` | `Authorization: Bearer <access_token>` | Returns citizen profile for the minted token |

**Env placeholders:** `EGOV_SSO_BASE_URL`, `EGOV_SSO_PARTNER_CODE`, `EGOV_SSO_PARTNER_SECRET`

### Partner callback URL (required)

Partners must register a **base URL** where eGovPH appends the authentication parameter `exchange_code`.

Example:

```text
https://test_website.com/egovph/sso?exchange_code=text_exchange_code
```

For BANGON (Android-first), the registered callback must deliver `exchange_code` into the app (HTTPS App Link / custom scheme that lands on a route equivalent to `/egovph/sso`). The Android client then posts the code to `apps/api` — **never** embed `partner_secret` on device.

### `POST /api/token` — Generates Access Token

Exchanges an authorization code for an access token using the eGov SSO service (OAuth 2.0 authorization code flow).

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `exchange_code` | string | Yes | Authorization code received after user authentication |
| `scope` | string | Yes | Requested scope. Use **`SSO_AUTHENTICATION`** for standard SSO login |
| `partner_code` | string | Yes | Unique code identifying the partner/agency system |
| `partner_secret` | string | Yes | Secret key for the partner account (server-side only) |

**Example body**

```json
{
  "exchange_code": "generated_exchange_code",
  "scope": "SSO_AUTHENTICATION",
  "partner_code": "{{partner_code}}",
  "partner_secret": "{{partner_secret}}"
}
```

**Example cURL**

```bash
curl --request POST \
  --url '{{base_url}}/api/token' \
  --header 'Content-Type: application/json' \
  --data '{
    "exchange_code": "generated_exchange_code",
    "scope": "SSO_AUTHENTICATION",
    "partner_code": "{{partner_code}}",
    "partner_secret": "{{partner_secret}}"
  }'
```

**Responses**

| Status | Description |
|--------|-------------|
| `200 OK` | Access token successfully generated |
| `403 Forbidden` | Partner credentials invalid or partner not authorized |
| `422 Unprocessable Entity` | Exchange code invalid, already used, or expired |

**Example `200` body**

```json
{
  "access_token": "eyJ…"
}
```

**Notes (authoritative)**

- `exchange_code` is **single-use** and expires after a short period.
- Store `partner_secret` securely; **never** expose it on the client (web or Android).
- Use the returned `access_token` in the `Authorization: Bearer …` header of subsequent SSO requests (including `/api/partner/sso_authentication`).
- Standard login scope is **`SSO_AUTHENTICATION`** — do not invent alternate scopes unless the dashboard documents them.

### `POST /api/partner/sso_authentication` — Citizen profile

After minting a token, call this endpoint with `Authorization: Bearer <access_token>` to obtain the citizen profile used for data sync / auto-login.

### SSO implementation logic (partner product rules)

| Case | Behavior |
|------|----------|
| **Existing users** | Match using `uniqid` or personal details (name, birthdate). Bind `uniqid` to streamline future logins and auto-authenticate. |
| **New users** | Automatically register using SSO details; guide through onboarding only if additional info is needed; then auto-authenticate. |

### Data sync map (from eGovPH)

Accurately map at least:

- name
- birthdate
- address
- email
- contact number
- `uniqid` (stable bind key)

Profile updates must occur **exclusively through eGovPH** — no direct profile/password editing in the partner UI.

### Partner UX / integration checklist

Grounded on the official eGov SSO integration checklist. For BANGON, “agency website” maps to the **Android client** (and any debug web shell):

1. **SSO functionality**
   - [ ] Data sync: map eGovPH user info (name, birthdate, address, email, contact number) + bind `uniqid`
   - [ ] Auto-login: user is logged in automatically after successful SSO
   - [ ] Profile locking: no direct profile edits in BANGON; updates via eGovPH only
   - [ ] No manual auth: no separate login/register/password flows; sessions managed via eGovPH SSO
2. **Mobile responsiveness** (Android + any web surfaces)
   - [ ] Layout: no overlapping / distorted text or images
   - [ ] Screen fitting across phone and tablet sizes
   - [ ] Performance and feature parity on mobile
3. **Hide / disable on partner UI**
   - Login & registration pages/screens
   - Profile & password management pages/screens
   - External app-download / competing auth links that bypass eGovPH

**Expected outcome:** Authenticated citizens access features without separate partner logins or local profile management.

### Core technical requirements

| Requirement | Rule |
|-------------|------|
| Active SSL | Mandatory end-to-end (HTTPS callback + API) |
| Mobile responsiveness | Required across devices |
| Partner base URL | Must accept `?exchange_code=` appended by eGovPH |

---


## 2. eVerify

**Purpose:** eVerify (NIDAS) — authenticate with client credentials, complete Face Liveness via the **eVerify Face Liveness Web SDK**, then verify personal information (and optional QR flows).

**Base URL:** `https://hackathon-everify-api.e.gov.ph`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/api/auth` | Client credentials in **body** | Obtain Bearer `access_token` (nested under `data`) |
| `POST` | `/api/query` | `Authorization: Bearer <access_token>` | Personal information verify (demographics + `face_liveness_session_id`) |
| `POST` | `/api/query/qr/check` | Bearer token | QR pre-check |
| `POST` | `/api/query/qr` | Bearer token | QR verify |

**Env placeholders:** `EVERIFY_BASE_URL`, `EVERIFY_CLIENT_ID`, `EVERIFY_CLIENT_SECRET`, optional `EVERIFY_PUBLIC_KEY` (Web SDK `pubKey` — client-side only; never ship `client_secret`)

### Tier verification flow (authoritative)

1. Obtain `access_token` from `POST /api/auth` (server-side).
2. Secure a `face_liveness_session_id` via the **eVerify Face Liveness Web SDK** (citizen device / WebView).
3. Submit demographics + `face_liveness_session_id` to `POST /api/query` with `Authorization: Bearer <access_token>`.

**Do not confuse** the Web SDK session with the separate platform **Face Liveness API** (`hackathon-face-liveness-api.e.gov.ph`, §8). Tier verify expects the Web SDK’s `result.session_id` mapped to the field name **`face_liveness_session_id`**.

### `POST /api/auth` — Obtain access token

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `client_id` | string | Yes | Dashboard client id |
| `client_secret` | string | Yes | Dashboard client secret (**server-side only**) |

**Example body**

```json
{
  "client_id": "{{client_id}}",
  "client_secret": "{{client_secret}}"
}
```

**Responses**

| Status | Description |
|--------|-------------|
| `200 OK` | Token issued |
| `403 Forbidden` | Invalid client credentials |

**Example `200` body**

```json
{
  "data": {
    "access_token": "eyJ…",
    "token_type": "Bearer",
    "expires_at": "1724223772"
  }
}
```

**Notes (authoritative)**

- Use `data.access_token` as `Authorization: Bearer …` on verify / QR endpoints.
- Never expose `client_secret` on Android or any client; keep it in env / server composition root.
- Adapter unwraps nested `data.access_token` (see `@egov/adapters-egov-platform` eVerify adapter).

### Face Liveness Web SDK (eVerify Tier)

Not a port on `FaceLivenessPort`. Hosted script for citizen capture; session id is then sent to eVerify verify.

| | |
|--|--|
| **Script** | `https://hackathon-everify-face-liveness.e.gov.ph/js/everify-liveness-sdk.min.js` |
| **Init** | `window.eKYC().start({ pubKey: "YOUR_PUBLIC_API_KEY" })` |
| **Public key env** | `EVERIFY_PUBLIC_KEY` (safe to embed in client; still prefer config injection) |

**Success payload (SDK)**

```json
{
  "status": "COMPLETED",
  "result": {
    "photo": "data:image/jpeg;base64,…",
    "session_id": "a1b3fae6-af74-4896-bd58-32a81604de01",
    "photo_url": "https://liveness.photo.url/image.jpg?expires=123"
  }
}
```

Map `result.session_id` → **`face_liveness_session_id`** on the verify request.

### `POST /api/query` — Verify personal information

Requires Bearer token from `/api/auth`. Body includes demographics plus the Web SDK session id.

**Example body**

```json
{
  "first_name": "Juan",
  "middle_name": "Santos",
  "last_name": "Dela Cruz",
  "suffix": "JR",
  "birth_date": "1989-09-12",
  "face_liveness_session_id": "a1b3fae6-af74-4896-bd58-32a81604de01"
}
```

| Field | Notes |
|-------|-------|
| `first_name`, `last_name` | Required demographics |
| `middle_name`, `suffix` | Optional as provided by citizen / SSO profile |
| `birth_date` | `YYYY-MM-DD` |
| `face_liveness_session_id` | From Web SDK `result.session_id` |

### QR endpoints

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/api/query/qr/check` | Bearer | QR pre-check |
| `POST` | `/api/query/qr` | Bearer | QR verify |

Do not invent QR payload fields beyond what the dashboard / live OpenAPI documents.

---

## 3. eMessage

**Purpose:** Deliver SMS, email, and in-app notices. The dashboard lists email and in-app as capabilities; **only SMS push is documented below** (paths for email / in-app are not invented here).

**Base URL (`{{base_url}}`):** `https://ws-message.e.gov.ph` (`EMESSAGE_BASE_URL`)

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/messaging/v1/sms/push` | Header `X-EMESSAGE-Auth` | SMS push |

**Env placeholders:** `EMESSAGE_BASE_URL`, `EMESSAGE_AUTH_TOKEN` (maps to `X-EMESSAGE-Auth` / `{{api_token}}`)

### `POST {{base_url}}/messaging/v1/sms/push` — Send SMS

Sends an SMS to a recipient number.

**Headers**

| Header | Value | Required |
|--------|-------|----------|
| `X-EMESSAGE-Auth` | `<API-TOKEN>` | Yes |
| `Content-Type` | `application/json` | Yes |

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `number` | string | Yes | E.164 format, e.g. `+639090000000` |
| `message` | string | Yes | SMS body |

**Example body**

```json
{
  "number": "+639090000000",
  "message": "Test message"
}
```

**Responses**

| Status | Description |
|--------|-------------|
| `201 Created` | SMS accepted |
| `400 Bad Request` | Invalid request |
| `422 Unprocessable Entity` | Validation failed |

**Example `201` body**

```json
{
  "data": {
    "message": "SMS was successfully created."
  }
}
```

**Notes**

- Adapter / BANGON callers must send E.164 `number` (not a local `to` alias on the wire).
- Email and in-app delivery are dashboard-listed capabilities; do not call invented paths until the dashboard documents them.

---

## 4. eGov AI

**Purpose:** Metered government AI — mint a short-lived hackathon token from an `access_code`, then call assistants / speech / tourism / laws / translator / document extractor / credits with `Authorization: Bearer <access_token>`.

**Base URL (`{{base}}`):** `https://egov-ai-core-ws.oueg.info`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/api/v1/egov/integration/token` | Body `access_code` | Mint Bearer token + credit snapshot |
| `POST` | `/api/v1/egov/integration/ai_assistant/generate` | Bearer | `{ prompt, category }` → `{ data, session_id }` |
| `POST` | `/api/v1/egov/integration/speech_maker/generate` | Bearer | Same body/response shape as assistant |
| `POST` | `/api/v1/egov/integration/tourism/generate` | Bearer | Same body/response shape as assistant |
| `POST` | `/api/v1/egov/integration/laws_and_regulations/generate` | Bearer | Same body/response shape as assistant |
| `POST` | `/api/v1/egov/integration/translator/generate` | Bearer | `{ prompt, source_lang, target_lang }` (ISO 639-1) |
| `POST` | `/api/v1/egov/integration/document_extractor/generate` | Bearer | **multipart/form-data** field `file` (JPEG/PNG/PDF) |
| `GET` | `/api/v1/egov/integration/credits` | Bearer | Remaining credits / expiry |

**Env placeholders:** `EGOV_AI_BASE_URL`, `EGOV_AI_ACCESS_CODE` (preferred; alias `EGOV_AI_API_KEY`)

### Auth flow (authoritative)

1. Call `POST …/token` with the dashboard `access_code`.
2. On `200`, store `access_token` and use it as `Authorization: Bearer {{hackathon_token}}` on all subsequent eGov AI calls.
3. Do **not** send the access code as an `X-API-Key` on generate/credits routes — Bearer only after mint.
4. Token / credit exhaustion surfaces as `401` on the token endpoint (and failed Bearer calls thereafter).

### `POST /api/v1/egov/integration/token` — Mint access token

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `access_code` | string | Yes | Dashboard access code (`EGOV_AI_ACCESS_CODE`) |

**Example body**

```json
{
  "access_code": "{{access_code}}"
}
```

**Example cURL**

```bash
curl --request POST \
  --url '{{base}}/api/v1/egov/integration/token' \
  --header 'Content-Type: application/json' \
  --data '{
    "access_code": "{{access_code}}"
  }'
```

**Responses**

| Status | Description |
|--------|-------------|
| `200 OK` | Token minted |
| `401 Unauthorized` | Invalid / exhausted access code |

**Example `200` body**

```json
{
  "access_token": "…",
  "expires_in_seconds": 3600,
  "credits_total": 100,
  "credits_remaining": 97
}
```

### Generate endpoints (assistant / speech / tourism / laws)

Shared contract for:

- `POST /api/v1/egov/integration/ai_assistant/generate`
- `POST /api/v1/egov/integration/speech_maker/generate`
- `POST /api/v1/egov/integration/tourism/generate`
- `POST /api/v1/egov/integration/laws_and_regulations/generate`

**Headers:** `Authorization: Bearer {{hackathon_token}}`, `Content-Type: application/json`

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | User / system prompt text |
| `category` | string | Yes | Category label (example: `"PH"`) |

**Example body**

```json
{
  "prompt": "Explain senior citizen benefits in plain language.",
  "category": "PH"
}
```

**Example `200` body**

```json
{
  "data": "…generated text…",
  "session_id": "…"
}
```

### `POST /api/v1/egov/integration/translator/generate`

**Headers:** Bearer + JSON

**Request body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prompt` | string | Yes | Text to translate |
| `source_lang` | string | Yes | ISO 639-1 source (e.g. `en`) |
| `target_lang` | string | Yes | ISO 639-1 target (e.g. `fil`) |

**Example `200` body**

```json
{
  "original_prompt": "…",
  "source_lang": "en",
  "target_lang": "fil",
  "translate_from": { "code": "en", "label": "English" },
  "translated_prompt": "…",
  "transliterated_prompt": "…"
}
```

### `POST /api/v1/egov/integration/document_extractor/generate`

**Headers:** Bearer (no JSON `Content-Type` — multipart boundary is set by the client)

**Body:** `multipart/form-data` with a single file field named **`file`**. Accepted types: JPEG, PNG, PDF.

**Example `200` body**

```json
{
  "data": "<html>…extracted content…</html>"
}
```

### `GET /api/v1/egov/integration/credits`

**Headers:** `Authorization: Bearer {{hackathon_token}}`

**Example `200` body**

```json
{
  "credits_total": 100,
  "credits_used": 3,
  "credits_remaining": 97,
  "expires_at": "2026-12-31T00:00:00Z"
}
```

### Notes (authoritative)

- Paths are under `/api/v1/egov/integration/…` — do not invent alternate roots (e.g. bare `/token`).
- Laws capability path is `laws_and_regulations/generate` (not `/laws`).
- Credits is **GET**, not POST.
- Document extractor is **multipart** only; do not POST a JSON file blob.
- Secrets (`access_code`) stay server-side in env; never ship them in the Android client.

---

## 5. eGovPay

**Purpose:** Payment gateway — generate a hosted payment, fetch transaction detail, or void a transaction.

**Base URL:** `https://egovpay-pgi-ws-dev.oueg.info` (`EGOVPAY_BASE_URL`)

**Auth header (all endpoints):** `X-eGovPay-Token: {{api_token}}`

**Content-Type:** `application/json; charset=utf-8`

Test mode uses a `test_`-prefixed token and does **not** touch live financial networks. Recompute `digest` on every generate request.

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/api/v1/transaction` | `X-eGovPay-Token` + body `digest` | Create payment; returns hosted gateway link |
| `GET` | `/api/v1/transaction/{{transaction_uuid}}` | `X-eGovPay-Token` | Full transaction detail |
| `PUT` | `/api/v1/transaction/{{transaction_uuid}}/void` | `X-eGovPay-Token` | Void a transaction |

**Env placeholders:** `EGOVPAY_BASE_URL`, `EGOVPAY_API_KEY` (alias: `EGOVPAY_TOKEN`), `EGOVPAY_SETTLEMENT_TEMPLATE_UUID`, optional `EGOVPAY_HMAC_SECRET` (if set, used as digest key instead of the API token)

### Digest formula (generate only)

```text
digest = HMAC-SHA256(key, "$amount|$txnid")   // hex digest
```

PHP equivalent from the dashboard:

```php
hash_hmac('sha256', "$amount|$txnid", $token);
```

- **Message:** literal concatenation of `amount`, `|`, and `txnid` (same values as in the JSON body).
- **Key:** API token by default (`EGOVPAY_API_KEY` / `EGOVPAY_TOKEN`); optional `EGOVPAY_HMAC_SECRET` overrides the key when present.
- Put `digest` in the **request body** — not as a custom digest header.
- Do **not** HMAC the full JSON body.

### `POST /api/v1/transaction` — Generate Payment

Creates a payment and returns a hosted gateway URL.

**Required body fields**

| Field | Type | Description |
|-------|------|-------------|
| `items` | array of `{ name, amount }` | Line items |
| `amount` | number (double) | Total amount |
| `settlement_template_uuid` | uuid | Settlement template (or set via `EGOVPAY_SETTLEMENT_TEMPLATE_UUID`) |
| `redirect_url` | url | Browser return URL after payment |
| `txnid` | string | Merchant transaction id |
| `callback_url` | url | Server callback / webhook URL |
| `digest` | string | HMAC-SHA256 of `"$amount|$txnid"` (see above) |

**Optional body fields**

| Field | Type | Description |
|-------|------|-------------|
| `currency` | string | e.g. `PHP` |
| `mobile` | string | Payer mobile |
| `email` | string | Payer email |
| `name` | string | Payer name |
| `expires_at` | string | `YYYY-MM-DD HH:MM:SS` |
| `link_expires_at` | string | `YYYY-MM-DD HH:MM:SS` |
| `description` | object | Free-form description object |

**Example body**

```json
{
  "items": [{ "name": "Benefit disbursement", "amount": 1000 }],
  "amount": 1000,
  "settlement_template_uuid": "{{settlement_template_uuid}}",
  "redirect_url": "https://example.com/pay/return",
  "txnid": "bangon-txn-001",
  "callback_url": "https://example.com/pay/callback",
  "digest": "{{hmac_sha256_hex}}",
  "currency": "PHP"
}
```

**Responses**

| Status | Description |
|--------|-------------|
| `201 Created` | Payment created |
| `401 Unauthorized` | Invalid / missing `X-eGovPay-Token` |
| `422 Unprocessable Entity` | Validation failed (missing fields, bad digest, etc.) |

**Example `201` body**

```json
{
  "data": {
    "uuid": "…",
    "url": "https://…",
    "channel": {
      "refno": "…"
    }
  }
}
```

### `GET /api/v1/transaction/{{transaction_uuid}}` — Check Transaction

**Headers:** `X-eGovPay-Token` only (no body digest).

**Responses**

| Status | Description |
|--------|-------------|
| `200 OK` | Transaction detail under `data` |
| `401 Unauthorized` | Invalid / missing token |
| `404 Not Found` | Unknown transaction uuid |

**Example `200` shape (fields under `data`)**

Includes at least: `uuid`, `refno`, `txnid`, `environment_type`, `items`, `amount`, `fees`, `currency`, `payment_status`, `channels`, URLs, timestamps, and related metadata as returned by the platform.

### `PUT /api/v1/transaction/{{transaction_uuid}}/void` — Void Transaction

**Headers:** `X-eGovPay-Token` only.

**Responses**

| Status | Description |
|--------|-------------|
| `200 OK` | Voided |
| `400 Bad Request` | Cannot void (e.g. already paid / invalid state) |
| `401 Unauthorized` | Invalid / missing token |
| `404 Not Found` | Unknown transaction uuid |

**Example `200` body**

```json
{
  "data": {
    "message": "You have successfully voided this transaction."
  }
}
```

**Notes**

- Only the three endpoints above are catalogued — do not invent extra Pay paths.
- Adapter injects `settlement_template_uuid` from env when the caller omits it, and always recomputes `digest` before POST.

---

## 6. eGovChain

**Purpose:** Blockchain JSON-RPC access for the hackathon chain (do not enumerate all ~60 RPC methods in application code — use a thin JSON-RPC client).

**Base URL:** `https://hackathon-blockchain.e.gov.ph`  
**Chain id:** `13371`  
**Explorer:** `https://hackathon-explorer.e.gov.ph`

The chain interface is **one HTTP `POST` JSON-RPC endpoint, not a collection of REST paths**. The operation is selected by the JSON body `method`. The authenticated dashboard page could not be refreshed during the final audit because the CDP browser session had expired; therefore this table distinguishes methods actually exercised on eGovChain from standard Ethereum-compatible candidates that must be feature-probed before use. The standard method semantics are documented by [ethereum.org's JSON-RPC reference](https://ethereum.org/developers/docs/apis/json-rpc/).

| JSON-RPC method | Project use | Verification / policy |
|---|---|---|
| `eth_chainId` | Refuse the wrong network | Live verified: `0x343b` / `13371` |
| `eth_blockNumber` | Node freshness and KPI | Live verified |
| `eth_getBalance` | Signer/account diagnostics | Adapter convenience method; read-only |
| `eth_call` | Read contract getters and simulate invariant/duplicate rejection | Live used by registry KPIs |
| `eth_sendRawTransaction` | Broadcast an already signed deployment/write | Live verified; backend signer only |
| `eth_getTransactionReceipt` | Confirm success, block, and contract creation | Live verified |
| `eth_getTransactionByHash` | Retrieve calldata/provenance for a known transaction | Live verified by the Tolvaris marker round-trip |
| `eth_getBlockByNumber` / `eth_getBlockByHash` | Block/timestamp audit view | Standard candidate; bounded read-only use |
| `eth_getCode` | Confirm a registry address contains contract bytecode | Standard candidate; deployment verification |
| `eth_getLogs` | Index registry events over a bounded block range | Standard candidate; paginate/range-limit |
| `eth_getTransactionCount` | Signer nonce management | Standard candidate; backend only |
| `eth_estimateGas` / `eth_gasPrice` | Prepare authorized writes | Standard candidate; never assume hackathon zero-fee behavior in production |

The adapter exposes a generic `call(method, params)` so application code does not pretend every Ethereum client method is enabled by this node. Public HTTP routes must use an allowlist; never expose unrestricted JSON-RPC proxying, account-management/debug methods, or a private key.

Applied uses in this repository:

- `eth_call`: exact/contextual project duplicate checks, card/project/ledger/accountability record read-back, and privacy-invariant simulations;
- signed transaction + `eth_sendRawTransaction`: registry deployments and synthetic authorized records;
- receipts: confirmation and explorer evidence;
- `eth_getTransactionByHash`: Tolvaris marker/calldata round-trip;
- `eth_chainId` and `eth_blockNumber`: platform availability and latency KPIs.

BANGON `anchorBenefitMatch` hashes locally and only calls `EgovChainPort.call` when `EGOVCHAIN_ANCHOR_METHOD` is set to a **dashboard-documented** method. Do not invent names such as `egov_anchorHash`.

**Env placeholders:** `EGOVCHAIN_RPC_URL`, `EGOVCHAIN_CHAIN_ID=13371`, optional `EGOVCHAIN_ANCHOR_METHOD`

---

## 7. eReport

**Purpose:** Let citizens file and track complaints and reports — submit a complaint, verify by OTP, then list and view report status by case number.

**Base URL:** `https://stg-ereport-ws.oueg.info` (path prefix `/api/integration`)

**Confirmed against the live dashboard API reference** (`platforms.e.gov.ph/dashboard/api-catalogs/ereport`), 2026-07-22 — corrects earlier guessed paths (`/datasets`, `/submit_complaint`, `/otp/verify`) that 404'd against the live platform.

**Three distinct tokens, not one:**
1. `access_token` ("integration_token") — from `POST /token`, Bearer for datasets/submit_complaint/verify.
2. `report_view_token` — from `POST /verify/confirm` (after OTP), header `X-EReport-View-Token` for reports list/view. Separate lifecycle from #1.
3. `access_code` — the pre-issued env credential used to obtain #1 (same role as other services' API keys).

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `GET` | `/datasets/report_types` | Bearer `access_token` | Fixed 9-type catalog (crime, red_tape, scam, child_abuse, women_abuse, overpricing, fire, accident, gas_station_concerns) |
| `GET` | `/datasets/regions` | Bearer `access_token` | PSA region list |
| `GET` | `/datasets/provinces?region_code=` | Bearer `access_token` | Provinces by region |
| `GET` | `/datasets/municipalities?province_code=` | Bearer `access_token` | Municipalities by province |
| `GET` | `/datasets/barangays?municipality_code=` | Bearer `access_token` | Barangays by municipality |
| `POST` | `/token` | none | Body `{access_code}` → `{access_token, expires_at}` |
| `POST` | `/submit_complaint` | Bearer `access_token` | Body: `mobile, first_name, last_name, gender, complainant_email, report_type, subject, message, evidences[], region_code, province_code, municipality_code, barangay_code, latitude?, longitude?` → `{code, message, case_number}` |
| `POST` | `/verify/request` | Bearer `access_token` | Body `{email}` → OTP sent, `{code, already_verified, message}` |
| `POST` | `/verify/confirm` | Bearer `access_token` | Body `{email, otp}` → `{code, report_view_token, expires_at}` |
| `GET` | `/reports` | Header `X-EReport-View-Token` | Query `q?, page?, limit?`; paginated JSON:API list |
| `GET` | `/reports/:case_number` | Header `X-EReport-View-Token` | Full report detail (complainant, report_type, address, status, history) |

Dataset and report-list responses use a JSON:API envelope (`{jsonapi, data: [{type, id, attributes}], meta: {pagination}}`); token/complaint/OTP actions return a flatter `{code, message, ...}` shape.

**Report-type mapping note:** no eReport category maps exactly to "benefit not delivered" (BANGON use case). `red_tape` is used as the closest fit for a government-service delay/failure — a judgment call, not an officially sanctioned category.

**Env placeholders:** `EREPORT_BASE_URL`, `EREPORT_ACCESS_TOKEN` (alias: `EREPORT_API_KEY`) — holds the `access_code` used to mint `access_token` via `POST /token`.

---

## 8. Face Liveness

**Purpose:** Platform **Face Liveness REST API** — create a capture session and retrieve the result (confidence score) for identity assurance gates that use this service directly.

**Base URL:** `https://hackathon-face-liveness-api.e.gov.ph`

**Auth:** header `x-api-key: <FACE_LIVENESS_API_KEY>` (not Bearer). Confirmed against dashboard catalog 2026-07-22.

| Capability | Method + path | Body / notes |
|------------|---------------|--------------|
| Create session | `POST /v1/liveness/session` | `{ "action": "redirect" \| "post" \| "close", "callback_url"?: string, "delay"?: number }` — `callback_url` required when `action` is `redirect`. Response includes `token` + `url` (citizen opens `url` to capture). |
| Get result | `GET /v1/liveness/result/:token` | Poll until terminal status. |

**Pass rule:** treat as verified only when status is `SUCCEEDED` **and** confidence **≥ 95.0** (`confidence_score` on the result payload).

**Env placeholders:** `FACE_LIVENESS_BASE_URL`, `FACE_LIVENESS_API_KEY`

**BANGON app surface (keeps API key server-side):** `POST /bangon/liveness/session`, `GET /bangon/liveness/result/:sessionToken` — see [api-android.md](./api-android.md).

### Relationship to eVerify Tier (do not invent bridges)

| Mechanism | Host / service | What you get | Used for |
|-----------|----------------|--------------|----------|
| **This API** (`FaceLivenessPort`) | `hackathon-face-liveness-api.e.gov.ph` | Session `token` + `url`; result via `getResult` | Server-side gate (`confirm-identity` after create + capture) |
| **eVerify Face Liveness Web SDK** | `hackathon-everify-face-liveness.e.gov.ph` script | `result.session_id` | Field **`face_liveness_session_id`** on eVerify `POST /api/query` (see [§2 eVerify](#2-everify)) |

These are **different** platform surfaces. Do not invent an endpoint that converts one session id into the other. For eVerify Tier personal-info verify, follow the Web SDK → `face_liveness_session_id` path in §2.

---

## 9. DBM Compass

**Purpose:** Centralized Open Monitoring Platform for Appropriations and Spending Statistics — programmatic access to public DBM budget-execution data (SAAODB, NCA, SARO, LGSF records and dashboard summaries).

**Base URL (`{{baseUrl}}`):** `https://dbm-ws.oueg.info`

**Auth (all endpoints):** header `X-API-Key: {{apiKey}}`

All listed routes are **GET** with query parameters (not POST JSON bodies).

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/v1/records/saaodb` | Paginated SAAODB records |
| `GET` | `/api/v1/records/saaodb/dashboard` | SAAODB cascade / rates summary |
| `GET` | `/api/v1/records/saaodb/entities` | Hierarchical department → agency → fund sources |
| `GET` | `/api/v1/records/nca` | Paginated NCA records |
| `GET` | `/api/v1/records/saro` | Paginated SARO records |
| `GET` | `/api/v1/records/lgsf` | Paginated LGSF records |
| `GET` | `/api/v1/records/lgsf/dashboard` | LGSF KPIs + projects |

**Env placeholders:** `DBM_COMPASS_BASE_URL`, `DBM_COMPASS_API_KEY`

### `GET /api/v1/records/saaodb` — SAAODB records

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reportYear` | integer | Yes | Fiscal report year (e.g. `2026`) |
| `period` | string | Yes | `Q1` \| `Q2` \| `Q3` \| `Q4` \| `FY` |
| `class` | string | No | `PS` \| `MOOE` \| `FINEX` \| `CO` |
| `sheetScope` | string | No | `summary` \| `agency` \| `sucs` |
| `entityName` | string | No | Partial match on entity name |
| `page` | integer | Yes | Page (starts at 1) |
| `limit` | integer | Yes | Page size (max `1000`) |

Record fields (examples): `id`, `fileVersionId`, `sourceRow`, `sheetScope`, `reportYear`, `asOfDate`, `period`, `isPreliminary`, `entityName`, `fundSource`, `class`, `appropriations`, `adjustments`, `totalAvailableAppropriations`, `allotments`, `obligations`, `unobligatedAllotments`, `disbursements`, `unpaidObligationsDue`, `unpaidObligationsNotDue`, `unpaidObligationsTotal`, `createdAt`.

```bash
curl --request GET \
  --url '{{baseUrl}}/api/v1/records/saaodb?reportYear=2026&period=FY&class=PS&sheetScope=summary&entityName=Agriculture&page=1&limit=100' \
  --header 'X-API-Key: {{apiKey}}'
```

### `GET /api/v1/records/saaodb/dashboard` — SAAODB dashboard summary

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `reportYear` | integer | Yes | Fiscal report year |
| `sheetScope` | string | Yes | `summary` \| `agency` \| `sucs` |

**Example `200` shape:** `reportYear`, `sheetScope`, `cascade` (appropriations, adjustments, totalAvailable, allotments, obligations, unobligated, disbursements, unreleased), `rates` (obligationRate, disbRateOblig, disbRateAppro), `classBreakdown[]`, `appropriationSplit`, `topEntities`.

### `GET /api/v1/records/saaodb/entities` — hierarchical entities

| Parameter | Required | Description |
|-----------|----------|-------------|
| `reportYear` | Yes | Fiscal report year |
| `sheetScope` | Yes | `agency` \| `sucs` |
| `expandParent` | No | Department name → child agencies |
| `expandEntity` | No | Agency name → fund sources |
| `expandEntityParent` | No | Disambiguate same-named agencies |

### `GET /api/v1/records/nca` — NCA records

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `budgetYear` | integer | Yes | Fiscal budget year |
| `deptCode` | string | No | UACS department code |
| `agencyCode` | string | No | UACS agency code |
| `operatingUnitCode` | string | No | Operating unit code |
| `expenseClass` | string | No | Expense class UACS code |
| `page` | integer | No | Default `1` |
| `limit` | integer | No | Default `100` |

**Response:** `{ data, total, page, limit }`.

### `GET /api/v1/records/saro` — SARO records

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `saroNo` | string | No | Exact SARO number |
| `deptCode` | string | No | UACS department code |
| `agencyCode` | string | No | UACS agency code |
| `expenseClass` | string | No | UACS expense class |
| `page` | integer | No | Default `1` |
| `limit` | integer | No | Default `100` |

**Response:** `{ data, total, page, limit }`. SARO objects include `saroNo`, `deptCode`, `agencyCode`, `expenseClass`, `amount`, `dateIssued`.

### `GET /api/v1/records/lgsf` — LGSF records

All query params optional (default pagination applies):

| Parameter | Description | Example |
|-----------|-------------|---------|
| `fiscalYear` | Program budget year | `2026` |
| `programCode` | `FALGU` \| `GEF` \| `GGG` \| `SBDP` \| `SAFPB` | `FALGU` |
| `regionCode` | Region UACS/geo code | `PH030000000` |
| `province` | Province name | `Bulacan` |
| `cityMunicipality` | City/municipality | `Malolos` |
| `page` / `limit` | Pagination | `1` / `100` |

### `GET /api/v1/records/lgsf/dashboard` — LGSF dashboard

| Parameter | Required | Description |
|-----------|----------|-------------|
| `programCode` | Yes | `FALGU` \| `GEF` \| `GGG` \| `SBDP` \| `SAFPB` |
| `reportYear` | No | Fiscal year for KPIs |
| `region` | No | GADM canonical name (e.g. `Region III`) |
| `province` / `municipality` | No | Name filters |
| `page` / `limit` | No | Projects list (default page `1`, limit `25`, max `200`) |

**Response:** `programCode`, `reportYear`, `kpis` (totalReleased, projectCount, lguCount, …), `trend`, `projects` (`rows`, `total`, `page`, `pageSize`).

### Notes (authoritative)

- Do **not** invent POST `/saaodb/query`-style paths — official surface is `GET /api/v1/records/…`.
- BANGON fund-check should call these GET endpoints with real query params (e.g. SAAODB `reportYear` + `period` + pagination).
- Adapter maps `X-API-Key` from `DBM_COMPASS_API_KEY`.

---

## Credentials checklist

1. Open [https://platforms.e.gov.ph/dashboard](https://platforms.e.gov.ph/dashboard).  
2. Issue or copy credentials for each service you enable.  
3. Put values in a local `.env` (never in git).  
4. Prefer env var names listed under each service above (also mirrored in `.env.example`).
