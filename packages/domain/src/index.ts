import { type Id, appError, err, ok, type Result } from "@egov/shared";

export type CitizenId = Id<"CitizenId">;
export type ServiceCaseId = Id<"ServiceCaseId">;
export type DocumentId = Id<"DocumentId">;
export type AgentTaskId = Id<"AgentTaskId">;

export type ServiceCaseStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "closed";

const ALLOWED: Record<ServiceCaseStatus, readonly ServiceCaseStatus[]> = {
  draft: ["submitted"],
  submitted: ["in_review"],
  in_review: ["approved", "rejected"],
  approved: ["closed"],
  rejected: ["closed"],
  closed: [],
};

export type Citizen = {
  readonly id: CitizenId;
  readonly displayName: string;
  readonly createdAt: Date;
};

export type CaseDocument = {
  readonly id: DocumentId;
  readonly caseId: ServiceCaseId;
  readonly fileName: string;
  readonly contentType: string;
  readonly createdAt: Date;
};

export type ServiceCase = {
  readonly id: ServiceCaseId;
  readonly citizenId: CitizenId;
  readonly title: string;
  readonly status: ServiceCaseStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export function createServiceCase(input: {
  id: ServiceCaseId;
  citizenId: CitizenId;
  title: string;
  now: Date;
}): Result<ServiceCase> {
  const title = input.title.trim();
  if (title.length === 0) {
    return err(appError("VALIDATION", "Service case title is required"));
  }
  return ok({
    id: input.id,
    citizenId: input.citizenId,
    title,
    status: "draft",
    createdAt: input.now,
    updatedAt: input.now,
  });
}

export function advanceServiceCase(
  serviceCase: ServiceCase,
  next: ServiceCaseStatus,
  now: Date,
): Result<ServiceCase> {
  const allowed = ALLOWED[serviceCase.status];
  if (!allowed.includes(next)) {
    return err(
      appError(
        "VALIDATION",
        `Cannot transition from ${serviceCase.status} to ${next}`,
      ),
    );
  }
  return ok({ ...serviceCase, status: next, updatedAt: now });
}

export type PipelineStage =
  | "foundation"
  | "design"
  | "build"
  | "verify"
  | "ship";

export type AgentRole =
  | "architect"
  | "designer"
  | "builder"
  | "verifier"
  | "ops";

export type AgentTaskStatus =
  | "queued"
  | "running"
  | "blocked"
  | "needs_human"
  | "completed"
  | "cancelled";

export type AgentTask = {
  readonly id: AgentTaskId;
  readonly stage: PipelineStage;
  readonly owner: AgentRole;
  readonly status: AgentTaskStatus;
  readonly summary: string;
  readonly correlationId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type DomainEvent =
  | {
      readonly type: "ServiceCaseSubmitted";
      readonly caseId: ServiceCaseId;
      readonly occurredAt: Date;
    }
  | {
      readonly type: "AgentTaskCompleted";
      readonly taskId: AgentTaskId;
      readonly stage: PipelineStage;
      readonly occurredAt: Date;
    }
  | {
      readonly type: "BenefitMatchFound";
      readonly matchId: BenefitMatchId;
      readonly citizenId: CitizenId;
      readonly benefitId: BenefitId;
      readonly occurredAt: Date;
    };

// ─── BANGON: benefit eligibility ────────────────────────────────────────────

export type BenefitId = Id<"BenefitId">;
export type BenefitMatchId = Id<"BenefitMatchId">;

export type DbmDataset = "SAAODB" | "NCA" | "SARO" | "LGSF";

/** Fields sourced from eVerify/PSA only — see docs/platform-apis.md.
 * No employment, income, or region data is available today. */
export type CitizenEligibilityProfile = {
  readonly dateOfBirth: Date;
  readonly civilStatus: string;
  readonly vitalStatus: string;
};

export type EligibilityRule = {
  readonly minAge?: number;
  readonly maxAge?: number;
  readonly civilStatusIn?: readonly string[];
  readonly vitalStatusIn?: readonly string[];
};

export type Benefit = {
  readonly id: BenefitId;
  readonly title: string;
  readonly agency: string;
  readonly isFinancial: boolean;
  readonly rule: EligibilityRule;
  /** Which DBM Compass dataset + query proves this benefit is currently funded. */
  readonly fundCheck: {
    readonly dataset: DbmDataset;
    /**
     * `dashboard` → SAAODB GET `/api/v1/records/saaodb/dashboard` (cascade).
     * Default / `records` → GET `/api/v1/records/{dataset}`.
     */
    readonly mode?: "records" | "dashboard";
    readonly query: Record<string, unknown>;
  };
};

export type BenefitMatch = {
  readonly id: BenefitMatchId;
  readonly citizenId: CitizenId;
  readonly benefitId: BenefitId;
  readonly matchedAt: Date;
};

function ageAt(dateOfBirth: Date, now: Date): number {
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > dateOfBirth.getMonth() ||
    (now.getMonth() === dateOfBirth.getMonth() &&
      now.getDate() >= dateOfBirth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}

function normalizeStatus(value: string): string {
  return value.trim().toUpperCase();
}

/** Pure eligibility check — no I/O. Fund status is checked separately
 * (DBM Compass) before a benefit is even offered as a match candidate.
 * Civil/vital status compares case-insensitively so eVerify casing
 * variants (e.g. "Alive") still match seed rules ("ALIVE"). */
export function isEligibleForBenefit(
  profile: CitizenEligibilityProfile,
  rule: EligibilityRule,
  now: Date,
): boolean {
  const age = ageAt(profile.dateOfBirth, now);
  if (rule.minAge !== undefined && age < rule.minAge) return false;
  if (rule.maxAge !== undefined && age > rule.maxAge) return false;
  if (rule.civilStatusIn !== undefined) {
    const civil = normalizeStatus(profile.civilStatus);
    if (!rule.civilStatusIn.some((s) => normalizeStatus(s) === civil)) {
      return false;
    }
  }
  if (rule.vitalStatusIn !== undefined) {
    const vital = normalizeStatus(profile.vitalStatus);
    if (!rule.vitalStatusIn.some((s) => normalizeStatus(s) === vital)) {
      return false;
    }
  }
  return true;
}
