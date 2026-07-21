# Government credential and document self-service retrieval

Tolvaris treats the blockchain as a tamper-evident source of truth that a pseudonymous holder has a valid credential issued by a specific department. It is **not a shared government data silo and not a source of document contents**. The holder requests an ID or legal document directly from its issuing department; only that department reads its own vault and returns the record directly to the authenticated holder.

## What is on-chain and off-chain

| On eGovChain | Issuer's encrypted off-chain vault |
|---|---|
| pseudonymous holder commitment | name and contact details |
| plaintext credential/document type | card/document number and fields |
| issuer agency code | ID/document image and portrait |
| credential and vault-pointer digests | biometrics and liveness capture |
| active/revoked/expired status | decryptable object-storage/database pointer |
| issuer policy digest | provider response and source record |
| challenge/request/consent/proof digests | consent and authorization evidence |
| release receipt digest and timestamp | holder/session-encrypted response and key material |

Encryption does not make public immutable data permanently private. Actual values and images therefore never belong on the public chain. A digest proves that the released object matches the attested object without exposing its contents.

## Challenge and release sequence

```mermaid
sequenceDiagram
  actor Holder as Credential holder
  participant Issuer as Issuing department API
  participant Gate as Issuer challenge gate
  participant Chain as eGovChain registry
  participant Vault as Issuer encrypted vault

  Issuer->>Chain: issuer-signed holder commitment + type + digests + status
  Holder->>Issuer: request my ID/document and exact fields/image
  Issuer->>Gate: create issuer-specific signed challenge
  Gate-->>Holder: nonce + credential + purpose + scope + short expiry
  Holder->>Gate: eGov SSO + holder signature + explicit consent
  opt policy requires it
    Holder->>Gate: fresh Face Liveness evidence
  end
  Gate->>Chain: verify active attestation is issuer-owned and tagged to holder
  Gate->>Gate: verify holder, purpose, freshness, policy, consent
  Issuer->>Chain: record decision digests + achieved assurance level
  alt all gates pass
    Issuer->>Vault: fetch holder's policy-allowed fields/image
    Vault-->>Issuer: authoritative record
    Issuer-->>Holder: holder/session-encrypted response
    Issuer->>Chain: record release payload/envelope digest receipt
  else any gate fails
    Issuer-->>Holder: deny without credential values
  end
```

No result is described as “100% certain.” The system produces a **high-assurance decision** from independently verified factors and fails closed when any required factor is missing, stale, revoked, mismatched, or below threshold.

## Department-specific challenges

Each issuing department owns an approved, versioned policy. The challenge is not a security question based on personal trivia; it is a signed, single-use cryptographic challenge bound to the issuer, authenticated holder commitment, credential, purpose, requested fields, nonce, and short expiry.

Illustrative policies in `DEPARTMENT_CHALLENGE_POLICY_EXAMPLES` are deliberately not production policy:

| Issuer API | Credential | Illustrative difference |
|---|---|---|
| BIR | TIN ID / tax registration | tax-specific purpose and minimal registration fields; image disabled by default |
| LTO | Driver licence | licence class/expiry/restrictions; higher liveness threshold; image may be returned only when requested, allowed, and explicitly consented |
| SSS | SSS credential | membership/coverage scope; image disabled by default |

The issuer remains authoritative. An LTO attestation can only authorize LTO to return that holder's LTO record; it does not let BIR, SSS, Tolvaris, or another agency retrieve it. A blockchain attestation never forces disclosure. Release additionally requires the issuer's approved API contract, authenticated holder, lawful purpose, data-minimization policy, applicable consent, and audited access controls.

## Generic normalized schema

```mermaid
erDiagram
  ISSUER ||--o{ CREDENTIAL_ATTESTATION : attests
  HOLDER_COMMITMENT ||--o{ CREDENTIAL_ATTESTATION : owns
  ASSURANCE_POLICY ||--o{ ACCESS_REQUEST : governs
  CREDENTIAL_ATTESTATION ||--o{ ACCESS_REQUEST : requested_for
  ACCESS_REQUEST ||--o| ACCESS_DECISION : resolved_by
  ACCESS_DECISION ||--o| RELEASE_RECEIPT : authorizes

  CREDENTIAL_ATTESTATION {
    bytes32 credentialKey PK
    bytes32 holderCommitment FK
    bytes32 credentialDigest
    bytes32 vaultPointerDigest
    string issuerAgencyCode
    string credentialType
    enum status
  }
  ASSURANCE_POLICY {
    bytes32 policyDigest
    string issuerAgencyCode
    string credentialType
    uint16 minimumAssuranceLevel
    bool imageReleaseAllowed
  }
  ACCESS_REQUEST {
    bytes32 requestId PK
    bytes32 fieldSetDigest
    bytes32 challengeDigest
    string purposeCode
    uint64 expiresAt
  }
  ACCESS_DECISION {
    bytes32 holderProofDigest
    bytes32 consentDigest
    bytes32 issuerChallengeProofDigest
    uint16 achievedAssuranceLevel
  }
  RELEASE_RECEIPT {
    bytes32 releasedPayloadDigest
    bytes32 encryptedEnvelopeDigest
    uint64 releasedAt
  }
```

Implementation: [`contracts/TolvarisCredentialExchangeRegistry.sol`](../contracts/TolvarisCredentialExchangeRegistry.sol) and [`packages/application/src/use-cases/credential-access.ts`](../packages/application/src/use-cases/credential-access.ts).
