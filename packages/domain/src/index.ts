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
    };
