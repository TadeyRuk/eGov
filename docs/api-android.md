# Android API contract (BANGON)

Frozen HTTP contract for the **Android BANGON client**. Talk only to `apps/api` — never call `platforms.e.gov.ph` or embed partner secrets in the app.

**Base URL:** `http://localhost:8787` locally (`PORT` env overrides). Deployed host TBD.

**Content-Type:** `application/json` for all request/response bodies unless noted.

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
{ "raw": {} }
```

Expect profile fields suitable for sync: name, birthdate, address, email, contact number, `uniqid` (exact JSON keys as returned by the platform — map in the client/server from `raw`).

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

### `POST /bangon/confirm-identity`

Two distinct liveness concepts — do not conflate:

1. **Face Liveness API** (`FaceLivenessPort`): server loads result via `sessionId` (`faceLiveness.getResult`). Pass = `SUCCEEDED` + confidence ≥ 95.0. **Do not** send client-invented confidence scores.
2. **eVerify Tier Web SDK**: `result.session_id` must be placed in eVerify verify payload as **`face_liveness_session_id`** (see [platform-apis.md §2](./platform-apis.md#2-everify)). That field belongs in `payload`, not as a substitute for the API gate `sessionId` unless product explicitly unifies the flows.

**Body:**

```json
{
  "token": "<eVerify Bearer access_token from POST /api/auth>",
  "payload": {
    "first_name": "Juan",
    "middle_name": "Santos",
    "last_name": "Dela Cruz",
    "suffix": "JR",
    "birth_date": "1989-09-12",
    "face_liveness_session_id": "<Web SDK result.session_id>"
  },
  "sessionId": "<Face Liveness API session id for getResult gate>"
}
```

**200:** `CitizenEligibilityProfile`

```json
{
  "dateOfBirth": "1950-01-01T00:00:00.000Z",
  "civilStatus": "widowed",
  "vitalStatus": "alive"
}
```

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

**Body:** `{ "citizenPhone": "+63…" }`  
**200:** empty success / `null`-ish void — treat 200 as sent  
**404:** match or benefit missing

### `POST /bangon/matches/:matchId/disburse`

No body. Financial benefits only.

**200:** `{ "transactionId": "…" }` (transactionId optional)  
**400:** benefit not financial  
**404:** match/benefit missing

### `POST /bangon/matches/:matchId/anchor`

No body. Anchors a hash of `{ citizenId, benefitId, matchedAt }` on eGovChain.

**200:** `{ "hash": "<hex>" }`  
**404:** match missing

### `POST /bangon/matches/:matchId/explain`

No body. Post-decision eGov AI narration (cosmetic; failure does not undo the match).

**200:** `{ "explanation": "…" }`  
**404:** match/benefit missing

### `POST /bangon/report-non-delivery`

Citizen-initiated complaint.

**Body:**

```json
{
  "token": "<eReport token>",
  "citizenId": "…",
  "benefitId": "…",
  "description": "Matched but never received benefit"
}
```

**200:** `{ "raw": {} }`

---

## Suggested Android flow

1. eGovPH callback (`…/egovph/sso?exchange_code=…`) → Android → `POST /auth/sso/exchange` with `SSO_AUTHENTICATION` → store `accessToken`.
2. Optional: `POST /auth/sso/profile` → sync name / birthdate / address / email / contact / `uniqid`; auto-login; no local profile edit.
3. Face Liveness: (a) platform Face Liveness API → `sessionId` for server gate; and/or (b) eVerify Face Liveness Web SDK → `face_liveness_session_id` for eVerify `/api/query` payload.
4. eVerify `access_token` + demographics (+ `face_liveness_session_id` when using Tier) → `POST /bangon/confirm-identity` → eligibility profile.
5. `POST /bangon/matches` → list of match ids.
6. Per match: `notify` / `disburse` / `anchor` / `explain` as needed.
7. If unpaid/undelivered: `POST /bangon/report-non-delivery`.

Ground truth for handlers: [`packages/adapters-http/src/index.ts`](../packages/adapters-http/src/index.ts) · mounts: [`apps/api/src/main.ts`](../apps/api/src/main.ts).
