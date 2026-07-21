# Executive System Architecture & Hackathon Specification: eGov PH SuperApp

> **Target Environment:** Official eGov PH Ecosystem Integration  
> **Core Objective:** Eliminate bureaucratic redundancy, optimize government processing, and provide a secure, tamper-evident nationwide SuperApp — architected to grow toward serving millions of citizens and handling 100M+ weekly transactions.  
> **Underlying Trust Model:** Peer-to-Peer Trust via **eGovChain** backed by **PSA PhilSys National ID (eVerify)** as the immutable ground source of truth.

---

## 1. Vision & Architectural Goals

The primary goal of the **eGov PH SuperApp** is to fully digitalize public service delivery across the Philippines—from top-level executive departments (DFA, SSS, Pag-IBIG, PhilHealth, DBM, DPWH) down to local government units (LGUs) and Barangay halls. 

### Key Objectives:
1. **Zero-Redundancy Onboarding (target):** Eliminate repeated registration processes across separate government agencies. If a citizen's data (Name, Age, Date of Birth, Civil Status, Religion, Vital/Alive status) is recorded in the Philippine Statistics Authority (PSA) via PhilSys National ID, it is meant to serve as the single source of truth across all agencies. **Current build status:** the domain model (`ServiceCase`) is a single-agency case tracker today — no agency field, no cross-agency cascade logic yet. Multi-agency propagation is the long-term product goal, out of scope for the hackathon build (see §5). This is a separate goal from BANGON below — cascade is about *keeping records in sync*, BANGON is about *proactively finding benefits*.
2. **BANGON — Proactive Benefit Matching:** Instead of citizens applying for benefits one by one, the SuperApp first checks (via DBM Compass) which agency benefits currently have sufficient funds, then scans a verified citizen and proactively matches them only against that fundable list, and notifies them in-app. See Workflow 1 (§4) for the full flow. This uses **Face Liveness** (live-person check) and **eVerify** (identity match) as its verification layer.
3. **High-Scale Performance (target):** Architected with a hexagonal ports/adapters structure so that asynchronous processing, optimized JSON-RPC caching, and state anchoring can be added later without a rewrite — with a longer-term target of **100,000,000+ transactions per week**. This figure is a design goal, not a verified capacity of the current hackathon-sandbox platform (see §5).
4. **Complete Inclusivity:** Universal accessibility designed for all demographics, specifically eliminating physical branch queuing for senior citizens, low-connectivity rural populations, and daily wage earners.
5. **Strict API Adherence:** Built strictly using **only the 9 official eGov PH APIs** without third-party external API dependencies.

---

## 2. Master API Integration Matrix

The SuperApp architecture relies exclusively on the 9 official eGov PH APIs:

| API Name | Core Functionality | SuperApp Architectural Role |
| :--- | :--- | :--- |
| **`eGov PH`** | Single Sign-On (SSO) | Citizen identity/login entry point for the SuperApp. Issues its own bearer token — does **not** gate calls to the other 8 services, each of which authenticates independently (see §3 note). |
| **`National ID \| eVerify`** | Identity & Vital Status Verification | Real-time PSA ground truth check (Name, DOB, Civil Status, Vital Status) with user consent. Own session token via its `/api/auth`. |
| **`Face Liveness`** | Biometric Liveness Capture | Anti-spoofing physical presence verification before executing critical or sensitive requests. Own platform token/API key. |
| **`eGovChain`** | Zero-Fee Hyperledger Besu Ledger (JSON-RPC only) | Immutable, tamper-evident state anchoring via **JSON-RPC 2.0** (not REST) for verifiable identity & transaction state. |
| **`eMessage`** | Unified Anti-Phishing Messaging | Secure SMS dispatch (`POST /messaging/v1/sms/push`, header `X-EMESSAGE-Auth`). The platform is a plain sender — **NO LINKS** / **NO OTPs** is a rule the SuperApp's caller enforces, not a platform guarantee (see §3.2). |
| **`eReport`** | Civic Discrepancy & Complaint Tracker | Issue logging for benefit mismatches, service delays, and community budget corruption. |
| **`DBM COMPASS`** | Public Spending Transparency | Programmatic access to DBM appropriations (SAAODB, SARO, NCA, LGSF) & DPWH project tracking. |
| **`eGov Pay`** | Unified National Payment Gateway | Encrypted fee collection, payment reference generation, instant settlement, and auto-reconciliation. |
| **`eGov AI`** | Metered Government Intelligence | Credit-based AI services (Chatbot, OCR, Legal Helper, Translator, Speech Drafter, Tourism). |

---

## 3. Detailed Component Architecture & Protocols

```
                          ┌─────────────────────────────────────────────────────────┐
                          │                 EGOV PH SUPERAPP UI                     │
                          │        (Mobile App / Web Portal / Barangay Kiosk)       │
                          └────────────────────────────┬────────────────────────────┘
                                                       │
                           ┌───────────────────────────┴───────────────────────────┐
                           │   eGov PH SSO (citizen login / identity entry point)  │
                           │   Issues its own token — does NOT gate the services   │
                           │   below; each authenticates independently.           │
                           └─────┬───────────────────────────────────────────┬─────┘
                                 │                                           │
         ┌───────────────────────┴──────────────┐             ┌──────────────┴──────────────────────┐
         │     IDENTITY & TRUST LAYER           │             │     SERVICE EXECUTION LAYER         │
         │  (each box below = own auth)         │             │  (each box below = own auth)        │
         ├──────────────────────────────────────┤             ├─────────────────────────────────────┤
         │ • eVerify — session token (own auth) │             │ • eGov Pay — token + HMAC digest    │
         │ • Face Liveness — platform token     │             │ • DBM COMPASS — X-API-Key header    │
         │ • eGovChain — JSON-RPC 2.0 (no REST) │             │ • eReport — token + OTP flows       │
         └──────────────────────────────────────┘             │ • eGov AI — token from dashboard    │
                                                              │ • eMessage — X-EMESSAGE-Auth header │
                                                              └─────────────────────────────────────┘
```

> **Auth note:** SSO is the citizen's login into the SuperApp UI. It is not an IAM proxy for the other 8 platform services — each one issues and validates its own credentials (see `docs/platform-apis.md` for the exact header/token per service). The SuperApp backend holds all 9 credential sets and calls each service directly.

---

### 3.1 Identity & Peer-to-Peer Trust Engine
* **Ground Truth Source:** All identity assertions reference the PSA PhilSys record via `National ID | eVerify`. **Target behavior (not built):** when a life event occurs (e.g., marriage, name change, death), updating the PSA record should cascade-validate across SSS, Pag-IBIG, PhilHealth, and DFA without manual form submission. This requires domain modeling (agency-linked `ServiceCase`s, a PSA-update event, propagation rules) not yet implemented — deferred past the hackathon build.
* **Biometric Verification Sequence (`Face Liveness`):**
  1. SuperApp initializes a session via `Face Liveness` API.
  2. Citizen performs live motion verification on their device.
  3. Biometric vector is verified against the encrypted PhilSys reference template via `eVerify`.
  4. **Pass rule:** the citizen is treated as verified only when Face Liveness status is `SUCCEEDED` **and** confidence **≥ 95.0**. Anything below threshold or any other status is a fail — no partial-credit path.
* **State Anchoring (`eGovChain`):**
  1. Once identity or transaction state is confirmed, a cryptographic proof (hash) is anchored to **eGovChain** (Hyperledger Besu zero-fee private network over JSON-RPC).
  2. State validation is publicly verifiable and tamper-evident, ensuring no agency can alter audit logs retroactively.

---

### 3.2 Secure Messaging Protocol (`eMessage`)
To safeguard citizens against rampant SMS phishing (smishing):
* **Platform reality:** `eMessage` is a plain SMS sender (`POST /messaging/v1/sms/push`, header `X-EMESSAGE-Auth`) — it does not itself inspect or block message content. The anti-phishing rules below are a contract the **SuperApp's eMessage adapter enforces before calling the API**, not a guarantee the platform provides.
* **Strict Anti-Phishing Rules (enforced by the SuperApp, not the platform):**
  * **Zero Hyperlinks Policy:** Outgoing SMS messages are **strictly prohibited** from containing clickable links/URLs.
  * **Zero Credentials Policy:** Outgoing SMS messages **never** include One-Time Passwords (OTPs) or authentication tokens.
* **Mandatory App Redirection Pattern:**
  * *SMS Payload:* `"eGov PH Alert: An update is available for your SSS benefit application. Open the official eGov PH SuperApp on your device to view status."`
  * Citizens must log into the SuperApp via `eGov PH SSO` to securely retrieve OTPs or complete actions.

---

### 3.3 Civic Oversight & Financial Transparency (`DBM COMPASS` + `eReport`)
* **Public Project Auditing:** `DBM COMPASS` provides direct access to Statement of Allotments, Obligations and Balances (SAAODB), Special Allotment Release Orders (SARO), and Notice of Cash Allocations (NCA).
* **DPWH Infrastructure Monitoring:** Citizens can inspect national/local DPWH road and building projects in their immediate geographic area.
* **Corruption & Discrepancy Reporting:**
  1. If a project is stalled, corrupted, or if a benefit calculation is incorrect, the citizen logs a formal case via `eReport`.
  2. The SuperApp generates an automated **In-App Notification** (`eMessage`) sent to all users in the affected LGU/Barangay area, displaying real-time updates and investigation case numbers.

---

### 3.4 Financial Gateway & Reconciliation (`eGov Pay`)
* **Unified Payment Processing:** Replaces individual agency payment setups with a single API integration point.
* **Core Capabilities:**
  * **Reference Generation:** Creates standardized unique payment reference numbers across all agencies.
  * **Real-time Confirmation:** Instant payment notification upon completion.
  * **Settlement Management:** Direct funds transfer to target government treasury accounts with real-time settlement support.
  * **Automated Reconciliation:** End-of-day ledger auto-matching for agency accounting offices.

---

### 3.5 Tokenized AI Infrastructure (`eGov AI`)
All AI capabilities strictly follow a 2-step execution lifecycle:
1. **Token Authorization & Credit Gatekeeper:** Call `eGov AI` token endpoint (`Generate token access_code temporary token, expiry, credits`). Check remaining credits before dispatching workloads.
2. **Execution Endpoints:**

| AI Endpoint Module | Functional Scope |
| :--- | :--- |
| **`AI Assistant`** | Conversational Q&A for government services with persistent Session IDs. |
| **`Speech Maker`** | Drafts official announcements and speeches for government officials. |
| **`Tourism`** | Generates localized travel itineraries and cultural guides. |
| **`Laws & Regulations`** | Legal query information helper (includes required official disclaimer). |
| **`Translator`** | Real-time translation between English, Tagalog, and regional dialects. |
| **`Document Extractor`** | OCR extraction of document fields (strictly restricted to non-sensitive test files). |
| **`Credits`** | Query current balance and remaining processing units. |

---

## 4. End-to-End System Workflows

### Workflow 1: BANGON — Proactive Benefit Matching

**BANGON** is the flagship feature of the SuperApp: instead of a citizen having to know which benefits exist and apply agency-by-agency, the app scans the citizen once and proactively finds what they already qualify for.

```
                                [ DBM Compass fund check ]
                  (runs first, independent of any one citizen —
                   which departments/benefits currently have
                   sufficient funds to cover eligible claimants?)
                                               │
                                               ▼
                             [ Fundable-benefit list ]
                    (only benefits with confirmed funding are
                     candidates for matching — an unfunded
                     benefit is never shown to a citizen)
                                               │
[ Citizen ] ──(Scan in via SuperApp)──> [ Existing ID read ]
                                              │
                          ┌───────────────────┴───────────────────┐
                          ▼                                       ▼
              [ Face Liveness Session ]              [ National ID | eVerify ]
              (confirms live real person)             (confirms ID is real & matches)
                          └───────────────────┬───────────────────┘
                                               ▼
                              [ Benefit-eligibility search ]
                    (checks this citizen against agency benefit
                     criteria, scoped to the fundable-benefit
                     list above — SSS, PhilHealth, etc.)
                                               │
                                    ┌──────────┴──────────┐
                                    ▼ eligible match found  ▼ no match
                          [ eMessage: eligibility alert ]   (no notification sent)
                          "You're eligible — open BANGON
                           to proceed"
                                    │
                                    ▼
                       [ eGovPay: disbursement ]
                    (only if the benefit is financial)
                                    │
                                    ▼
                    [ eGovChain: anchor the match + transaction ]
                 (every eligibility check, fund check, and payment
                  is anchored for tamper-evident audit)

  If a matched/processed benefit is never actually received:
  citizen files a complaint via [ eReport ] — same reporting
  mechanism as Workflow 2, not a separate system.
```

> **Why DBM Compass runs first:** fund status is a property of the *department/benefit*, not the citizen — checking it once, before matching, means a citizen is never told "you're eligible" for something that turns out to be unfunded. The old ordering (match first, check funds after) could produce a dead-end "eligible but not actually payable" result with no path forward.

> **Hackathon scope note:** the eGovChain anchor step is a single synchronous JSON-RPC call — no batching, no async fallback. That's sufficient for a 1-day demo. Handling eGovChain latency/downtime gracefully (retry, async anchor queue) is a post-hackathon concern, not part of the day-1 build.

> **eGov AI throughout:** `eGov AI` (Assistant, Laws & Regulations, Translator) runs alongside this whole flow — explaining in plain language why a citizen qualifies, what a benefit means, and helping with in-app navigation. This is specifically aimed at making the flow usable for senior citizens and low-digital-literacy users without needing to understand government terminology.

> **Build status:** the identity-confirmation steps (Face Liveness, eVerify) and the platform integrations (DBM Compass, eMessage, eGovPay, eGovChain, eReport) exist as ports/adapters today (see `docs/architecture.md`). The **benefit-eligibility search** — matching a citizen against agency benefit criteria — has no corresponding port, adapter, or domain concept yet. This is the actual novel piece BANGON needs; see `docs/architecture.md`'s Product Vision section for the open design question.

---

### Workflow 2: DPWH Project Tracking & Corruption Report

```
[ Citizen ] ──(Select Map View)──> [ DBM COMPASS API ]
                                           │
                                           ▼
                            (Display SARO/NCA DPWH Data)
                                           │
                                           ▼
                             [ File Fraud via eReport ]
                                           │
                        ┌──────────────────┴──────────────────┐
                        ▼                                     ▼
               [ Case ID Generated ]                [ Geo-Targeted Notice ]
            (Track Progress in App)                 (Pushed to Local Area)
```

---

### Workflow 3: Payment & Settlement Lifecycle

```
[ Service Application ] ──> [ eGov Pay: Generate Reference ID ]
                                           │
                                           ▼
                                 [ Citizen Pays Fee ]
                                           │
                                           ▼
                             [ Real-Time Confirmation ]
                                           │
                        ┌──────────────────┴──────────────────┐
                        ▼                                     ▼
              [ Settlement to Treasury ]            [ Auto-Reconciliation ]
              (Direct Bank/Agency Ledger)            (Agency Admin Dashboard)
```

---

## 5. Future Direction: Path to High Scale (not a hackathon build target)

The **100M+ transactions/week** figure is a long-term design target, not a claim about current capacity — the platform endpoints used for this build run on hackathon-sandbox infrastructure (e.g. `hackathon-blockchain.e.gov.ph`) with no published SLA or throughput guarantee. The hackathon build does **not** implement the items below; they're listed to show the architecture has swap-in points for them later without a rewrite, because the domain/application layers are isolated from infrastructure behind ports (hexagonal architecture).

1. **State Anchoring Layer (later):** batched merkle-tree anchors instead of one-by-one JSON-RPC calls, once throughput requires it.
2. **Database & Cache Strategy (later):** Redis cluster for session/credit tracking; partitioned Postgres by LGU/Region — the hackathon build uses a single in-memory or single-instance store per `docs/criteria.md` Foundation criteria.
3. **Queue & Notification Pipeline (later):** Kafka/RabbitMQ for `eMessage`/`eReport` fan-out — the hackathon build calls these synchronously.
4. **Data Privacy Posture:** Compliant with Republic Act No. 10173 (Data Privacy Act of 2012). Biometric capture and verification is handled entirely by the eGov Face Liveness platform — the SuperApp itself does not store biometric data.

---

## 6. Nationwide Governance Rollout (Federal to Barangay)

* **Barangay Portal Integration:** Local barangay clearance issuing offices use the same `eGov PH SSO` login and `eGov Pay` service (each with its own independent auth, per §3), giving citizens a unified transaction history from barangay permits to passport renewals.
* **Senior Citizen Digital Accessibility:** Simple voice-assisted AI interfaces (`eGov AI Translator + Assistant`) and high-contrast, one-click biometric verification reduce technological barriers for elderly citizens.
* **Official Hackathon Platform Integration:** Hexagonal ports/adapters isolation — each of the 9 platform integrations is its own adapter behind a port interface (see `packages/adapters-egov-platform/`), so a failure or change in one service (e.g. eGov Pay) can't cascade into the others or into core domain logic. No container/deployment tooling exists yet; this is a code-structure property, not a packaging one.
