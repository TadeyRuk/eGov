import {
  advanceCaseStatus,
  getServiceCase,
  submitServiceCase,
  type AdvanceServiceCaseDeps,
  type GetServiceCaseDeps,
  type SubmitServiceCaseDeps,
} from "@egov/application";
import type { CitizenId, ServiceCaseId, ServiceCaseStatus } from "@egov/domain";
import { createId, type AppError, type Result } from "@egov/shared";

export type HttpResponse = {
  readonly status: number;
  readonly body: unknown;
};

export function toHttpResponse<T>(result: Result<T>): HttpResponse {
  if (result.ok) {
    return { status: 200, body: result.value };
  }
  return { status: statusFor(result.error), body: { error: result.error } };
}

function statusFor(error: AppError): number {
  switch (error.code) {
    case "NOT_FOUND":
      return 404;
    case "VALIDATION":
      return 400;
    case "CONFLICT":
      return 409;
    case "FORBIDDEN":
      return 403;
    case "UNAVAILABLE":
      return 503;
    default:
      return 500;
  }
}

export type CaseHttpHandlers = {
  submit(body: {
    citizenId: string;
    title: string;
  }): Promise<HttpResponse>;
  get(caseId: string): Promise<HttpResponse>;
  advance(
    caseId: string,
    body: { nextStatus: ServiceCaseStatus },
  ): Promise<HttpResponse>;
};

export function createCaseHttpHandlers(
  deps: SubmitServiceCaseDeps & GetServiceCaseDeps & AdvanceServiceCaseDeps,
): CaseHttpHandlers {
  return {
    async submit(body) {
      const result = await submitServiceCase(deps, {
        citizenId: createId<"CitizenId">(body.citizenId) as CitizenId,
        title: body.title,
      });
      if (result.ok) {
        return { status: 201, body: result.value };
      }
      return toHttpResponse(result);
    },
    async get(caseId) {
      return toHttpResponse(
        await getServiceCase(
          deps,
          createId<"ServiceCaseId">(caseId) as ServiceCaseId,
        ),
      );
    },
    async advance(caseId, body) {
      return toHttpResponse(
        await advanceCaseStatus(deps, {
          caseId: createId<"ServiceCaseId">(caseId) as ServiceCaseId,
          nextStatus: body.nextStatus,
        }),
      );
    },
  };
}

export function healthResponse(): HttpResponse {
  return { status: 200, body: { status: "ok", service: "egov-api" } };
}
