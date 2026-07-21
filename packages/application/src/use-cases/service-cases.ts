import {
  advanceServiceCase,
  createServiceCase,
  type ServiceCase,
  type ServiceCaseId,
} from "@egov/domain";
import { err, newId, ok, type Result } from "@egov/shared";
import type {
  AdvanceCaseInput,
  Clock,
  EventBus,
  ServiceCaseRepository,
  SubmitCaseInput,
} from "../ports/index.js";

export type SubmitServiceCaseDeps = {
  readonly cases: ServiceCaseRepository;
  readonly events: EventBus;
  readonly clock: Clock;
};

export async function submitServiceCase(
  deps: SubmitServiceCaseDeps,
  input: SubmitCaseInput,
): Promise<Result<ServiceCase>> {
  const created = createServiceCase({
    id: newId("case"),
    citizenId: input.citizenId,
    title: input.title,
    now: deps.clock.now(),
  });
  if (!created.ok) return created;

  const submitted = advanceServiceCase(
    created.value,
    "submitted",
    deps.clock.now(),
  );
  if (!submitted.ok) return submitted;

  const saved = await deps.cases.save(submitted.value);
  if (!saved.ok) return saved;

  const published = await deps.events.publish({
    type: "ServiceCaseSubmitted",
    caseId: saved.value.id,
    occurredAt: deps.clock.now(),
  });
  if (!published.ok) return err(published.error);

  return ok(saved.value);
}

export type AdvanceServiceCaseDeps = {
  readonly cases: ServiceCaseRepository;
  readonly clock: Clock;
};

export async function advanceCaseStatus(
  deps: AdvanceServiceCaseDeps,
  input: AdvanceCaseInput,
): Promise<Result<ServiceCase>> {
  const existing = await deps.cases.getById(input.caseId);
  if (!existing.ok) return existing;

  const next = advanceServiceCase(
    existing.value,
    input.nextStatus,
    deps.clock.now(),
  );
  if (!next.ok) return next;

  return deps.cases.save(next.value);
}

export type GetServiceCaseDeps = {
  readonly cases: ServiceCaseRepository;
};

export async function getServiceCase(
  deps: GetServiceCaseDeps,
  caseId: ServiceCaseId,
): Promise<Result<ServiceCase>> {
  return deps.cases.getById(caseId);
}
