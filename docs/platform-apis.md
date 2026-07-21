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
| 2 | [eVerify](#2-everify) | `https://hackathon-everify-api.e.gov.ph` | Token from `/api/auth` |
| 3 | [eMessage](#3-emessage) | `https://ws-message.e.gov.ph` | Header `X-EMESSAGE-Auth` |
| 4 | [eGov AI](#4-egov-ai) | `https://egov-ai-core-ws.oueg.info` | Token / API credentials from dashboard |
| 5 | [eGovPay](#5-egovpay) | `https://egovpay-pgi-ws-dev.oueg.info` | `X-eGovPay-Token` + HMAC digest |
| 6 | [eGovChain](#6-egovchain) | `https://hackathon-blockchain.e.gov.ph` | JSON-RPC 2.0 (chain id `13371`) |
| 7 | [eReport](#7-ereport) | `https://stg-ereport-ws.oueg.info` | Token + OTP flows |
| 8 | [Face Liveness](#8-face-liveness) | `https://hackathon-face-liveness-api.e.gov.ph` | Platform token / API key from dashboard |
| 9 | [DBM Compass](#9-dbm-compass) | `https://dbm-ws.oueg.info` | Header `X-API-Key` |

Related UI (not an API port): blockchain explorer `https://hackathon-explorer.e.gov.ph`

---

## 1. eGov SSO

**Purpose:** Partner SSO — exchange an authorization code for an access token, then fetch the citizen profile.

**Base URL:** `https://hackathon-sso.e.gov.ph`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/api/token` | Partner credentials in body | Body fields: `exchange_code`, `scope`, `partner_code`, `partner_secret` → access token |
| `POST` | `/api/partner/sso_authentication` | `Authorization: Bearer <token>` | Returns citizen profile |

**Env placeholders:** `EGOV_SSO_BASE_URL`, `EGOV_SSO_PARTNER_CODE`, `EGOV_SSO_PARTNER_SECRET`

---

## 2. eVerify

**Purpose:** Authenticate to eVerify, verify personal information, and check/verify QR credentials.

**Base URL:** `https://hackathon-everify-api.e.gov.ph`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/api/auth` | Client credentials (dashboard) | Obtain session / API token |
| `POST` | `/api/query` | Bearer token from `/api/auth` | Personal information verify |
| `POST` | `/api/query/qr/check` | Bearer token | QR pre-check |
| `POST` | `/api/query/qr` | Bearer token | QR verify |

**Env placeholders:** `EVERIFY_BASE_URL`, `EVERIFY_CLIENT_ID`, `EVERIFY_CLIENT_SECRET`

---

## 3. eMessage

**Purpose:** Push SMS messages through the eMessage messaging service.

**Base URL:** `https://ws-message.e.gov.ph`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| `POST` | `/messaging/v1/sms/push` | Header `X-EMESSAGE-Auth` | SMS push |

**Env placeholders:** `EMESSAGE_BASE_URL`, `EMESSAGE_AUTH_TOKEN`

---

## 4. eGov AI

**Purpose:** Platform AI capabilities — auth token, assistants, speech, tourism, laws, translation, document extraction, and credits.

**Base URL:** `https://egov-ai-core-ws.oueg.info`

| Capability | Auth | Notes |
|------------|------|-------|
| `token` | Dashboard credentials | Obtain access token |
| `ai_assistant` | Token / API key from dashboard | General assistant |
| `speech_maker` | Token / API key from dashboard | Speech generation |
| `tourism` | Token / API key from dashboard | Tourism Q&A |
| `laws` | Token / API key from dashboard | Legal / reference assistant |
| `translator` | Token / API key from dashboard | Translation |
| `document_extractor` | Token / API key from dashboard | Document extraction |
| `credits` | Token / API key from dashboard | Usage / remaining credits |

Exact HTTP paths for each capability are as exposed by the platform on the dashboard; use the capability names above as the catalog surface.

**Env placeholders:** `EGOV_AI_BASE_URL`, `EGOV_AI_ACCESS_CODE` (alias: `EGOV_AI_API_KEY`)

---

## 5. eGovPay

**Purpose:** Payment gateway — generate a transaction, fetch it, or void it.

**Base URL:** `https://egovpay-pgi-ws-dev.oueg.info`

| Capability | Auth | Notes |
|------------|------|-------|
| Generate payment / transaction | `X-eGovPay-Token` + HMAC digest | Create payable transaction |
| Get transaction | `X-eGovPay-Token` + HMAC digest | Fetch status / details |
| Void transaction | `X-eGovPay-Token` + HMAC digest | Void a transaction |

HMAC algorithm and signing material come from the dashboard.

**Env placeholders:** `EGOVPAY_BASE_URL`, `EGOVPAY_API_KEY` (alias: `EGOVPAY_TOKEN`), optional `EGOVPAY_HMAC_SECRET` (falls back to API key for digest), optional `EGOVPAY_SETTLEMENT_TEMPLATE_UUID`

---

## 6. eGovChain

**Purpose:** Blockchain JSON-RPC access for the hackathon chain (do not enumerate all ~60 RPC methods in application code — use a thin JSON-RPC client).

**Base URL:** `https://hackathon-blockchain.e.gov.ph`  
**Chain id:** `13371`  
**Explorer:** `https://hackathon-explorer.e.gov.ph`

| Interface | Auth | Notes |
|-----------|------|-------|
| JSON-RPC 2.0 `POST` to base URL | As required by platform | Generic `call(method, params)` |
| Convenience methods (examples) | — | `eth_call`, `eth_sendRawTransaction`, `eth_getTransactionReceipt`, `eth_blockNumber`, `eth_getBalance` |

**Env placeholders:** `EGOVCHAIN_RPC_URL`, `EGOVCHAIN_CHAIN_ID=13371`

---

## 7. eReport

**Purpose:** Reporting service — datasets, auth token, submit complaint, OTP verification, list/view reports.

**Base URL:** `https://stg-ereport-ws.oueg.info`

| Capability | Auth | Notes |
|------------|------|-------|
| `datasets` | Token / API key from dashboard | List / query datasets |
| `token` | Dashboard credentials | Auth token |
| `submit_complaint` | Token | File a complaint |
| OTP verify | Token | Verify OTP |
| List / view reports | Token | Report retrieval |

**Env placeholders:** `EREPORT_BASE_URL`, `EREPORT_ACCESS_TOKEN` (alias: `EREPORT_API_KEY`)

---

## 8. Face Liveness

**Purpose:** Create a face-liveness session and retrieve the result for identity assurance.

**Base URL:** `https://hackathon-face-liveness-api.e.gov.ph`

| Capability | Auth | Notes |
|------------|------|-------|
| Create session | Platform token / API key from dashboard | Start liveness capture session |
| Get result | Platform token / API key from dashboard | Poll / fetch outcome |

**Pass rule:** treat as verified only when status is `SUCCEEDED` **and** confidence **≥ 95.0**.

**Env placeholders:** `FACE_LIVENESS_BASE_URL`, `FACE_LIVENESS_API_KEY`

---

## 9. DBM Compass

**Purpose:** Query DBM fiscal / allotment datasets (SAAODB, NCA, SARO, LGSF).

**Base URL:** `https://dbm-ws.oueg.info`

| Dataset | Auth | Notes |
|---------|------|-------|
| SAAODB | Header `X-API-Key` | Allotment / obligation related queries |
| NCA | Header `X-API-Key` | Notice of Cash Allocation |
| SARO | Header `X-API-Key` | Special Allotment Release Order |
| LGSF | Header `X-API-Key` | Local Government Support Fund |

**Env placeholders:** `DBM_COMPASS_BASE_URL`, `DBM_COMPASS_API_KEY`

---

## Credentials checklist

1. Open [https://platforms.e.gov.ph/dashboard](https://platforms.e.gov.ph/dashboard).  
2. Issue or copy credentials for each service you enable.  
3. Put values in a local `.env` (never in git).  
4. Prefer env var names listed under each service above (also mirrored in `.env.example`).
