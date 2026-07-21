# Android API contract (BANGON)

Frozen HTTP contract for the **Android BANGON client**. Talk only to `apps/api` — never call `platforms.e.gov.ph` or embed partner secrets in the app.

**Base URL:** `http://localhost:8787` locally (`PORT` env overrides). Deployed host TBD.

**Content-Type:** `application/json` for all request/response bodies unless noted.

### Server requirements (for Face Liveness + BANGON)

Operator / deploy env (never in the APK):

| Variable | Required for | Notes |
|----------|--------------|-------|
| `FACE_LIVENESS_API_KEY` | `/bangon/liveness/*`, `confirm-identity` gate | Dashboard → Face Liveness; sent as `x-api-key` |
| `FACE_LIVENESS_BASE_URL` | optional | Default `https://hackathon-face-liveness-api.e.gov.ph` |
| `EVERIFY_*` | `confirm-identity` eVerify call | See `.env.example` |
| `SSO_*` | `/auth/sso/*` | Partner code/secret stay server-side |
| `PORT` | optional | Default `8787` |

Copy from [`.env.example`](../.env.example) into local `.env` (gitignored).

**Errors:** non-2xx bodies look like:

```json
{ "error": { "code": "NOT_FOUND|VALIDATION|CONFLICT|FORBIDDEN|UNAVAILABLE|INTERNAL", "message": "…" } }
```

| HTTP | Typical `code` |
|------|----------------|
| 400 | `VALIDATION` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT` |
| 503 | `UNAVAILABLE` |
| 500 | `INTERNAL` |

CORS: hackathon API allows `Access-Control-Allow-Origin: *` and answers `OPTIONS` preflight.

---

## Auth (citizen SSO)

Grounded on official eGov SSO (`docs/platform-apis.md` §1). Partner credentials stay **server-side**. eGovPH redirects to the registered partner callback with `?exchange_code=…`; Android receives that code (App Link / deep link equivalent to `/egovph/sso`), then calls these routes. The app holds the returned `accessToken` for profile refresh.

**Product rules (must follow):**

- Scope for token exchange is **`SSO_AUTHENTICATION`** (default if omitted).
- Auto-login after successful SSO; bind citizens by `uniqid` (or name + birthdate).
- No in-app login / registration / password / local profile-edit screens — identity updates only via eGovPH.
- Never ship `partner_secret` in the APK.

BANGON eligibility still uses eVerify / Face Liveness as documented below (not gated by SSO middleware in this pass).

### `POST /auth/sso/exchange`

Exchange an SSO authorization code for an access token (server adds partner code/secret and calls `POST {{sso_base}}/api/token`).

**Body:**

```json
{ "exchangeCode": "…", "scope": "SSO_AUTHENTICATION" }
```

`scope` is optional on this API; when omitted the server sends `SSO_AUTHENTICATION` to the platform.

**200:**

```json
{
  "accessToken": "…",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "raw": {}
}
```

Platform success payload is primarily `{ "access_token": "…" }`. `tokenType` / `expiresIn` may be omitted if the platform omits them. `raw` is the untyped platform JSON.

Typical platform errors mapped by the API: invalid/used/expired code → `422` / `VALIDATION`; bad partner credentials → `403` / `FORBIDDEN`.

### `POST /auth/sso/profile`

Fetch the citizen profile for an SSO access token (`POST {{sso_base}}/api/partner/sso_authentication`).

**Body:**

```json
{ "accessToken": "…" }
```

**200:**

```json
{
  "raw": {},
  "uniqid": "…",
  "fullName": "…",
  "firstName": "…",
  "middleName": "…",
  "lastName": "…",
  "birthdate": "…",
  "address": "…",
  "email": "…",
  "contactNumber": "…"
}
```

Typed fields are filled only when present in the platform JSON (aliases like `uniqid` / `uniqueId`, `birth_date` / `birthdate`, etc.). `raw` is always the untyped platform body.

---

## Health

### `GET /health`

**200:** `{ "status": "ok", "service": "egov-api" }`

---

## Service cases

### `POST /cases`

**Body:** `{ "citizenId": "…", "title": "…" }`

**201:** `ServiceCase` object (`id`, `citizenId`, `title`, `status`, `createdAt`, `updatedAt`).

### `GET /cases/:id`

**200:** `ServiceCase`  
**404:** case missing

### `POST /cases/:id/advance`

**Body:** `{ "nextStatus": "submitted"|"in_review"|"approved"|"rejected"|"closed" }`  
(only legal transitions — see domain status machine)

**200:** updated `ServiceCase`

### `POST /cases/:id/documents`

**Body:**

```json
{
  "fileName": "id.png",
  "contentType": "image/png",
  "contentBase64": "…"
}
```

**201:** `CaseDocument` metadata (`id`, `caseId`, `fileName`, `contentType`, `createdAt`)  
**400:** invalid base64  
**404:** case missing

---

## BANGON

### `POST /bangon/liveness/session`

Starts a Face Liveness API capture session. **API key stays on the server** — Android never calls `hackathon-face-liveness-api.e.gov.ph` directly.

**Body:**

```json
{
  "action": "close",
  "callbackUrl": "https://your.app/liveness-done",
  "delay": 3000
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `action` | yes | `"redirect"` \| `"post"` \| `"close"` |
| `callbackUrl` | when `action` is `"redirect"` | Where the capture UI returns after success |
| `delay` | no | ms to show completion screen (platform default 3000) |

**201:**

```json
{
  "token": "<session token>",
  "url": "https://…/capture…",
  "raw": {}
}
```

Open `url` in a WebView / Custom Tab. Keep `token` for result polling and `confirm-identity`.

**400:** missing `callbackUrl` for `redirect`, or platform validation error  
**503:** missing `FACE_LIVENESS_API_KEY` / platform unavailable

### `GET /bangon/liveness/result/:sessionToken`

Poll until terminal status. Server proxies `GET /v1/liveness/result/:token`.

**200:**

```json
{
  "status": "SUCCEEDED",
  "confidence": 98.5,
  "passed": true,
  "referenceImageUrl": "https://…",
  "raw": {}
}
```

`passed` is `true` only when `status === "SUCCEEDED"` and `confidence >= 95.0`.

### `POST /bangon/confirm-identity`

Dual path (both required):

1. **Face Liveness API** — `sessionToken` from `POST /bangon/liveness/session`; server polls result; pass = `SUCCEEDED` + confidence ≥ 95.0.
2. **eVerify Tier Web SDK** — `faceLivenessSessionId` (= SDK `result.session_id`) plus demographics; server builds official `/api/query` body including `face_liveness_session_id`.

**Body:**

```json
{
  "token": "<eVerify Bearer access_token from POST /api/auth>",
  "sessionToken": "<Face Liveness API token from /bangon/liveness/session>",
  "faceLivenessSessionId": "<Web SDK result.session_id>",
  "firstName": "Juan",
  "middleName": "Santos",
  "lastName": "Dela Cruz",
  "suffix": "JR",
  "birthDate": "1989-09-12"
}
```

`sessionId` is accepted as an alias for `sessionToken`.

**200:** `CitizenEligibilityProfile`

```json
{
  "dateOfBirth": "1950-01-01T00:00:00.000Z",
  "civilStatus": "WIDOWED",
  "vitalStatus": "ALIVE"
}
```

**400:** missing Face Liveness API token, Tier session id, or demographics  
**403:** Face Liveness API gate did not pass (`SUCCEEDED` + confidence ≥ 95.0)

### `POST /bangon/matches`

Persists matches server-side; use returned `id` values for later steps.

**Body:**

```json
{
  "citizenId": "…",
  "profile": {
    "dateOfBirth": "1950-01-01",
    "civilStatus": "widowed",
    "vitalStatus": "alive"
  }
}
```

**200:** array of `BenefitMatch` (`id`, `citizenId`, `benefitId`, `matchedAt`)

### `POST /bangon/matches/:matchId/notify`

The same endpoint supports one contextual SMS per benefit event. `category` defaults to `QUALIFICATION_RESULT`.

```json
{
  "citizenPhone": "+639000000000",
  "category": "REQUIREMENTS_NEEDED",
  "contextKey": "requirements-v2",
  "requirements": ["Valid government ID", "Signed application form"]
}
```

Categories and required context:

| Category | Additional body |
|---|---|
| `BENEFIT_ANNOUNCEMENT` | none |
| `QUALIFICATION_RESULT` | none |
| `REQUIREMENTS_NEEDED` | non-empty `requirements` array |
| `APPLICATION_STATUS` | `statusText` |
| `ACTION_REMINDER` | `actionText`; optional `deadlineText` |

`contextKey` is the stable agency event/version identifier. The server hashes it with the recipient and category for idempotency. When omitted, it defaults to the match ID plus category.

**200:** `{ "status": "SENT|SUPPRESSED_DUPLICATE|SUPPRESSED_CATEGORY_COOLDOWN|SUPPRESSED_DAILY_LIMIT", "category": "…", "deliveryId": "…" }`

**400:** invalid phone/category or missing category-specific context

**404:** match or benefit missing

The policy permits at most one message for the same context, one message per category every six hours, and five total benefit messages per recipient in 24 hours. SMS bodies contain no links or OTP language. The delivery ledger stores only recipient/context digests, category, ID, and timestamp—not phone numbers or message bodies. The current in-memory repository enforces this per running process; production must bind the port to durable storage with an atomic idempotency constraint.

### `POST /bangon/matches/:matchId/disburse`

**Body:**

```json
{
  "amount": 1000,
  "redirectUrl": "https://…/pay/return",
  "callbackUrl": "https://…/pay/callback",
  "txnid": "optional-merchant-id",
  "currency": "PHP"
}
```

`redirectUrl` / `callbackUrl` may be omitted when `EGOVPAY_REDIRECT_URL` / `EGOVPAY_CALLBACK_URL` are set on the server. Financial benefits only.

**200:** `{ "transactionId": "…" }` (transactionId optional)  
**400:** benefit not financial or missing Pay URLs  
**404:** match/benefit missing

### `POST /bangon/matches/:matchId/anchor`

No body. Computes SHA-256 of `{ citizenId, benefitId, matchedAt }`. Submits to eGovChain **only** when `EGOVCHAIN_ANCHOR_METHOD` is set to a dashboard-documented JSON-RPC method.

**200:** `{ "hash": "<hex>", "chainSubmitted": false }`  
**404:** match missing

### `POST /bangon/matches/:matchId/explain`

No body. Post-decision eGov AI narration (cosmetic; failure does not undo the match).

**200:** `{ "explanation": "…" }`  
**404:** match/benefit missing

### `POST /bangon/report-non-delivery`

Citizen-initiated eReport complaint. Maps to eReport `submit_complaint` with report type `red_tape` (closest available category). Requires a prior eReport `accessToken` from the platform token endpoint (server can hold integration `access_code` — Android sends the bearer it was given, or you expose a thin token route later).

**Body:**

```json
{
  "accessToken": "<eReport access_token>",
  "citizenId": "…",
  "benefitId": "…",
  "benefitTitle": "Social Pension",
  "mobile": "639171234567",
  "firstName": "Juan",
  "lastName": "Dela Cruz",
  "gender": "Male",
  "email": "juan@example.com",
  "description": "Matched but never received benefit",
  "regionCode": "…",
  "provinceCode": "…",
  "municipalityCode": "…",
  "barangayCode": "…"
}
```

**200:** `{ "caseNumber": "…" }`

---

## Suggested Android flow

1. eGovPH callback (`…/egovph/sso?exchange_code=…`) → Android → `POST /auth/sso/exchange` with `SSO_AUTHENTICATION` → store `accessToken`.
2. Optional: `POST /auth/sso/profile` → sync name / birthdate / address / email / contact / `uniqid`; auto-login; no local profile edit.
3. Face Liveness API gate: `POST /bangon/liveness/session` → open returned `url` → poll `GET /bangon/liveness/result/:token` until `passed` (or fail). Keep `token` as `sessionToken`.
4. eVerify Tier Web SDK → `faceLivenessSessionId` (= `result.session_id`).
5. eVerify `access_token` + demographics + both session ids → `POST /bangon/confirm-identity`.
6. `POST /bangon/matches` → list of match ids.
7. Per match: `notify` / `disburse` / `anchor` / `explain` as needed.
8. If unpaid/undelivered: `POST /bangon/report-non-delivery`.

Ground truth for handlers: [`packages/adapters-http/src/index.ts`](../packages/adapters-http/src/index.ts) · mounts: [`apps/api/src/main.ts`](../apps/api/src/main.ts).
