export type CredentialType =
  | "NATIONAL_ID"
  | "TIN_ID"
  | "DRIVER_LICENSE"
  | "SSS_ID"
  | "PHILHEALTH_ID"
  | "PASSPORT"
  | "BUSINESS_REGISTRATION"
  | "GOVERNMENT_DOCUMENT"
  | (string & {});

export type AssuranceFactor =
  | "EGOV_SSO"
  | "ACTIVE_ISSUER_ATTESTATION"
  | "FRESH_LIVENESS"
  | "HOLDER_SIGNATURE"
  | "ISSUER_CHALLENGE_SIGNATURE"
  | "EXPLICIT_CONSENT"
  | "PURPOSE_BINDING";

export type CredentialAttestation = {
  readonly credentialKey: string;
  readonly holderCommitment: string;
  readonly issuerAgencyCode: string;
  readonly credentialType: CredentialType;
  readonly status: "ACTIVE" | "REVOKED" | "EXPIRED";
  readonly expiresAt?: string;
};

export type DepartmentChallengePolicy = {
  readonly issuerAgencyCode: string;
  readonly credentialType: CredentialType | "*";
  readonly requiredFactors: readonly AssuranceFactor[];
  readonly minimumLivenessConfidence: number;
  readonly maximumChallengeAgeSeconds: number;
  readonly allowedFields: readonly string[];
  readonly imageReleaseAllowed: boolean;
};

export type CredentialAccessChallenge = {
  readonly challengeId: string;
  readonly issuerAgencyCode: string;
  readonly credentialKey: string;
  readonly recipientHolderCommitment: string;
  readonly purposeCode: string;
  readonly nonce: string;
  readonly requestedFields: readonly string[];
  readonly requestCredentialImage: boolean;
  readonly issuedAt: string;
  readonly expiresAt: string;
};

export type CredentialAccessProof = {
  readonly authenticatedHolderCommitment: string;
  readonly factors: readonly AssuranceFactor[];
  readonly livenessConfidence: number | null;
  readonly consentedFields: readonly string[];
  readonly consentedToImage: boolean;
  readonly presentedAt: string;
};

export type CredentialAccessDecision = {
  readonly approved: boolean;
  readonly assurance: "INSUFFICIENT" | "HIGH";
  readonly releasableFields: readonly string[];
  readonly releaseCredentialImage: boolean;
  readonly reasons: readonly string[];
};

function validDate(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Deterministic release gate. It authorizes an encrypted-vault release; it never
 * returns credential values or images and never describes assurance as 100%.
 */
export function evaluateCredentialAccess(input: {
  readonly attestation: CredentialAttestation;
  readonly policy: DepartmentChallengePolicy;
  readonly challenge: CredentialAccessChallenge;
  readonly proof: CredentialAccessProof;
}): CredentialAccessDecision {
  const reasons: string[] = [];
  const { attestation, policy, challenge, proof } = input;
  const presentedAt = validDate(proof.presentedAt);
  const issuedAt = validDate(challenge.issuedAt);
  const expiresAt = validDate(challenge.expiresAt);

  if (attestation.status !== "ACTIVE") reasons.push("Credential attestation is not active");
  if (attestation.expiresAt) {
    const credentialExpiry = validDate(attestation.expiresAt);
    if (credentialExpiry === null || presentedAt === null || credentialExpiry < presentedAt) {
      reasons.push("Credential attestation is expired or has an invalid expiry");
    }
  }
  if (
    policy.issuerAgencyCode !== challenge.issuerAgencyCode ||
    challenge.issuerAgencyCode !== attestation.issuerAgencyCode
  ) {
    reasons.push("Challenge issuer does not match the attesting department");
  }
  if (
    challenge.recipientHolderCommitment !== attestation.holderCommitment ||
    proof.authenticatedHolderCommitment !== attestation.holderCommitment
  ) {
    reasons.push("Authenticated recipient does not match the attested holder");
  }
  if (policy.credentialType !== "*" && policy.credentialType !== attestation.credentialType) {
    reasons.push("Credential type is not accepted by this department policy");
  }
  if (challenge.credentialKey !== attestation.credentialKey) {
    reasons.push("Challenge is not bound to the attested credential");
  }
  if (!challenge.purposeCode.trim()) reasons.push("Purpose binding is required");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(challenge.nonce)) reasons.push("Challenge nonce is invalid");
  if (presentedAt === null || issuedAt === null || expiresAt === null) {
    reasons.push("Challenge timestamps are invalid");
  } else {
    if (presentedAt < issuedAt || presentedAt > expiresAt) reasons.push("Challenge is not currently valid");
    if ((expiresAt - issuedAt) / 1000 > policy.maximumChallengeAgeSeconds) {
      reasons.push("Challenge lifetime exceeds department policy");
    }
  }

  const factors = new Set(proof.factors);
  for (const factor of policy.requiredFactors) {
    if (!factors.has(factor)) reasons.push(`Missing assurance factor: ${factor}`);
  }
  if (
    policy.requiredFactors.includes("FRESH_LIVENESS") &&
    (proof.livenessConfidence === null || proof.livenessConfidence < policy.minimumLivenessConfidence)
  ) {
    reasons.push("Liveness confidence is below department policy");
  }

  const allowed = new Set(policy.allowedFields);
  const consented = new Set(proof.consentedFields);
  const releasableFields = challenge.requestedFields.filter(
    (field, index, fields) => allowed.has(field) && consented.has(field) && fields.indexOf(field) === index,
  );
  if (releasableFields.length !== challenge.requestedFields.length) {
    reasons.push("One or more requested fields are not allowed or not consented");
  }
  const releaseCredentialImage =
    challenge.requestCredentialImage && policy.imageReleaseAllowed && proof.consentedToImage;
  if (challenge.requestCredentialImage && !releaseCredentialImage) {
    reasons.push("Credential image release is not allowed or not explicitly consented");
  }

  return {
    approved: reasons.length === 0,
    assurance: reasons.length === 0 ? "HIGH" : "INSUFFICIENT",
    releasableFields: reasons.length === 0 ? releasableFields : [],
    releaseCredentialImage: reasons.length === 0 && releaseCredentialImage,
    reasons,
  };
}

const COMMON_FACTORS: readonly AssuranceFactor[] = [
  "EGOV_SSO",
  "ACTIVE_ISSUER_ATTESTATION",
  "FRESH_LIVENESS",
  "HOLDER_SIGNATURE",
  "ISSUER_CHALLENGE_SIGNATURE",
  "EXPLICIT_CONSENT",
  "PURPOSE_BINDING",
];

/** Illustrative policies only; departments must approve production factors and fields. */
export const DEPARTMENT_CHALLENGE_POLICY_EXAMPLES: readonly DepartmentChallengePolicy[] = [
  {
    issuerAgencyCode: "BIR",
    credentialType: "TIN_ID",
    requiredFactors: COMMON_FACTORS,
    minimumLivenessConfidence: 95,
    maximumChallengeAgeSeconds: 120,
    allowedFields: ["tin", "registeredName", "registrationStatus"],
    imageReleaseAllowed: false,
  },
  {
    issuerAgencyCode: "LTO",
    credentialType: "DRIVER_LICENSE",
    requiredFactors: COMMON_FACTORS,
    minimumLivenessConfidence: 97,
    maximumChallengeAgeSeconds: 90,
    allowedFields: ["licenseNumber", "licenseClass", "expiryDate", "restrictionCodes", "portrait"],
    imageReleaseAllowed: true,
  },
  {
    issuerAgencyCode: "SSS",
    credentialType: "SSS_ID",
    requiredFactors: COMMON_FACTORS,
    minimumLivenessConfidence: 97,
    maximumChallengeAgeSeconds: 90,
    allowedFields: ["sssNumber", "membershipStatus", "coverageDate"],
    imageReleaseAllowed: false,
  },
];
