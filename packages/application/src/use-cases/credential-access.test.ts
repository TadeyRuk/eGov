import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEPARTMENT_CHALLENGE_POLICY_EXAMPLES,
  evaluateCredentialAccess,
  type CredentialAccessProof,
} from "./credential-access.js";

const attestation = {
  credentialKey: "0xcredential",
  holderCommitment: "0xholder",
  issuerAgencyCode: "LTO",
  credentialType: "DRIVER_LICENSE",
  status: "ACTIVE" as const,
  expiresAt: "2027-01-01T00:00:00.000Z",
};
const challenge = {
  challengeId: "challenge-1",
  issuerAgencyCode: "LTO",
  credentialKey: "0xcredential",
  recipientHolderCommitment: "0xholder",
  purposeCode: "LICENSE_RENEWAL",
  nonce: "abcdefghijklmnop",
  requestedFields: ["licenseNumber", "expiryDate"],
  requestCredentialImage: false,
  issuedAt: "2026-07-22T00:00:00.000Z",
  expiresAt: "2026-07-22T00:01:00.000Z",
};
const proof: CredentialAccessProof = {
  authenticatedHolderCommitment: "0xholder",
  factors: ["EGOV_SSO", "ACTIVE_ISSUER_ATTESTATION", "FRESH_LIVENESS", "HOLDER_SIGNATURE", "ISSUER_CHALLENGE_SIGNATURE", "EXPLICIT_CONSENT", "PURPOSE_BINDING"],
  livenessConfidence: 98,
  consentedFields: ["licenseNumber", "expiryDate"],
  consentedToImage: false,
  presentedAt: "2026-07-22T00:00:30.000Z",
};
const lto = DEPARTMENT_CHALLENGE_POLICY_EXAMPLES.find((item) => item.issuerAgencyCode === "LTO")!;

describe("evaluateCredentialAccess", () => {
  it("approves only policy-allowed, explicitly consented fields", () => {
    const result = evaluateCredentialAccess({ attestation, policy: lto, challenge, proof });
    assert.equal(result.approved, true);
    assert.deepEqual(result.releasableFields, ["licenseNumber", "expiryDate"]);
    assert.equal(result.releaseCredentialImage, false);
  });

  it("rejects a stale challenge and insufficient liveness", () => {
    const result = evaluateCredentialAccess({
      attestation,
      policy: lto,
      challenge,
      proof: { ...proof, livenessConfidence: 90, presentedAt: "2026-07-22T00:02:00.000Z" },
    });
    assert.equal(result.approved, false);
    assert.ok(result.reasons.some((reason) => reason.includes("currently valid")));
    assert.ok(result.reasons.some((reason) => reason.includes("Liveness")));
  });

  it("does not release an image without explicit image consent", () => {
    const result = evaluateCredentialAccess({
      attestation,
      policy: lto,
      challenge: { ...challenge, requestCredentialImage: true },
      proof,
    });
    assert.equal(result.approved, false);
    assert.equal(result.releaseCredentialImage, false);
  });

  it("rejects a different authenticated holder", () => {
    const result = evaluateCredentialAccess({
      attestation,
      policy: lto,
      challenge,
      proof: { ...proof, authenticatedHolderCommitment: "0xdifferent-holder" },
    });
    assert.equal(result.approved, false);
    assert.ok(result.reasons.some((reason) => reason.includes("attested holder")));
  });
});
