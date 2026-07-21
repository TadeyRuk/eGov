import {
  advanceCaseStatus,
  anchorBenefitMatch,
  attachDocument,
  confirmCitizenIdentity,
  disburseBenefit,
  exchangeSsoToken,
  explainEligibility,
  findEligibleBenefits,
  getServiceCase,
  getSsoCitizenProfile,
  notifyEligibility,
  reportBenefitNonDelivery,
  submitServiceCase,
  type AdvanceServiceCaseDeps,
  type AnchorBenefitMatchDeps,
  type AttachDocumentDeps,
  type BenefitCatalogPort,
  type BenefitMatchRepository,
  type ConfirmCitizenIdentityDeps,
  type DisburseBenefitDeps,
  type ExchangeSsoTokenDeps,
  type ExplainEligibilityDeps,
  type FaceLivenessPort,
  type FindEligibleBenefitsDeps,
  type GetServiceCaseDeps,
  type GetSsoCitizenProfileDeps,
  type NotifyEligibilityDeps,
  type ReportBenefitNonDeliveryDeps,
  type SubmitServiceCaseDeps,
} from "@egov/application";
import type {
  BenefitId,
  BenefitMatchId,
  CitizenEligibilityProfile,
  CitizenId,
  ServiceCaseId,
  ServiceCaseStatus,
} from "@egov/domain";
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
  attachDocument(
    caseId: string,
    body: {
      fileName: string;
      contentType: string;
      /** Base64-encoded file bytes */
      contentBase64: string;
    },
  ): Promise<HttpResponse>;
};

export function createCaseHttpHandlers(
  deps: SubmitServiceCaseDeps &
    GetServiceCaseDeps &
    AdvanceServiceCaseDeps &
    AttachDocumentDeps,
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
    async attachDocument(caseId, body) {
      let content: Uint8Array;
      try {
        content = decodeBase64(body.contentBase64);
      } catch {
        return {
          status: 400,
          body: {
            error: {
              code: "VALIDATION",
              message: "contentBase64 must be valid base64",
            },
          },
        };
      }
      const result = await attachDocument(deps, {
        caseId: createId<"ServiceCaseId">(caseId) as ServiceCaseId,
        fileName: body.fileName,
        contentType: body.contentType,
        content,
      });
      if (result.ok) {
        return { status: 201, body: result.value };
      }
      return toHttpResponse(result);
    },
  };
}

function decodeBase64(input: string): Uint8Array {
  return Uint8Array.from(Buffer.from(input, "base64"));
}

export function healthResponse(): HttpResponse {
  return { status: 200, body: { status: "ok", service: "egov-api" } };
}

// ─── BANGON handlers ─────────────────────────────────────────────────────
//
// Each handler maps a request DTO to a use case call and back to an HTTP
// response, per docs/design.md's "HTTP adapter... Map DTO <-> use case I/O.
// Must not embed business invariants." Multi-step actions on an existing
// match (notify/disburse/anchor/explain) look the match up via
// BenefitMatchRepository + BenefitCatalogPort first — the use cases
// themselves never do repository lookups.

export type BangonHttpDeps = ConfirmCitizenIdentityDeps &
  FindEligibleBenefitsDeps &
  NotifyEligibilityDeps &
  DisburseBenefitDeps &
  AnchorBenefitMatchDeps &
  ExplainEligibilityDeps &
  ReportBenefitNonDeliveryDeps & {
    readonly benefits: BenefitCatalogPort;
    readonly matches: BenefitMatchRepository;
    /** Server-side liveness lookup — never trust client-supplied scores. */
    readonly faceLiveness: FaceLivenessPort;
  };

export type BangonHttpHandlers = {
  confirmIdentity(body: {
    token: string;
    payload: Record<string, unknown>;
    sessionId: string;
  }): Promise<HttpResponse>;
  findMatches(body: {
    citizenId: string;
    profile: { dateOfBirth: string; civilStatus: string; vitalStatus: string };
  }): Promise<HttpResponse>;
  notify(matchId: string, body: { citizenPhone: string }): Promise<HttpResponse>;
  disburse(
    matchId: string,
    body: {
      amount: number;
      redirectUrl: string;
      callbackUrl: string;
      txnid?: string;
      currency?: string;
    },
  ): Promise<HttpResponse>;
  anchor(matchId: string): Promise<HttpResponse>;
  explain(matchId: string): Promise<HttpResponse>;
  reportNonDelivery(body: {
    token: string;
    citizenId: string;
    benefitId: string;
    description: string;
  }): Promise<HttpResponse>;
};

async function loadMatchAndBenefit(
  deps: Pick<BangonHttpDeps, "matches" | "benefits">,
  matchId: string,
) {
  const match = await deps.matches.getById(
    createId<"BenefitMatchId">(matchId) as BenefitMatchId,
  );
  if (!match.ok) return match;
  const benefit = await deps.benefits.getById(match.value.benefitId);
  if (!benefit.ok) return benefit;
  return {
    ok: true as const,
    value: { match: match.value, benefit: benefit.value },
  };
}

export function createBangonHttpHandlers(
  deps: BangonHttpDeps,
): BangonHttpHandlers {
  return {
    async confirmIdentity(body) {
      const liveness = await deps.faceLiveness.getResult(body.sessionId);
      if (!liveness.ok) return toHttpResponse(liveness);
      const profile = await confirmCitizenIdentity(deps, {
        token: body.token,
        payload: body.payload,
        liveness: liveness.value,
      });
      return toHttpResponse(profile);
    },

    async findMatches(body) {
      const profile: CitizenEligibilityProfile = {
        dateOfBirth: new Date(body.profile.dateOfBirth),
        civilStatus: body.profile.civilStatus,
        vitalStatus: body.profile.vitalStatus,
      };
      const matches = await findEligibleBenefits(deps, {
        citizenId: createId<"CitizenId">(body.citizenId) as CitizenId,
        profile,
      });
      return toHttpResponse(matches);
    },

    async notify(matchId, body) {
      const loaded = await loadMatchAndBenefit(deps, matchId);
      if (!loaded.ok) return toHttpResponse(loaded);
      const result = await notifyEligibility(deps, {
        citizenPhone: body.citizenPhone,
        benefitTitle: loaded.value.benefit.title,
      });
      return toHttpResponse(result);
    },

    async disburse(matchId, body) {
      const loaded = await loadMatchAndBenefit(deps, matchId);
      if (!loaded.ok) return toHttpResponse(loaded);
      const result = await disburseBenefit(deps, {
        citizenId: loaded.value.match.citizenId,
        benefit: loaded.value.benefit,
        amount: body.amount,
        redirectUrl: body.redirectUrl,
        callbackUrl: body.callbackUrl,
        ...(body.txnid !== undefined ? { txnid: body.txnid } : {}),
        ...(body.currency !== undefined ? { currency: body.currency } : {}),
      });
      return toHttpResponse(result);
    },

    async anchor(matchId) {
      const loaded = await loadMatchAndBenefit(deps, matchId);
      if (!loaded.ok) return toHttpResponse(loaded);
      const result = await anchorBenefitMatch(deps, {
        match: loaded.value.match,
      });
      return toHttpResponse(result);
    },

    async explain(matchId) {
      const loaded = await loadMatchAndBenefit(deps, matchId);
      if (!loaded.ok) return toHttpResponse(loaded);
      const result = await explainEligibility(deps, {
        benefitTitle: loaded.value.benefit.title,
        rule: loaded.value.benefit.rule,
      });
      return toHttpResponse(result);
    },

    async reportNonDelivery(body) {
      const result = await reportBenefitNonDelivery(deps, {
        token: body.token,
        citizenId: createId<"CitizenId">(body.citizenId) as CitizenId,
        benefitId: createId<"BenefitId">(body.benefitId) as BenefitId,
        description: body.description,
      });
      return toHttpResponse(result);
    },
  };
}

// ─── Auth (citizen SSO) ───────────────────────────────────────────────────

export type AuthHttpDeps = ExchangeSsoTokenDeps & GetSsoCitizenProfileDeps;

export type AuthHttpHandlers = {
  exchangeSso(body: {
    exchangeCode: string;
    /** Defaults to `SSO_AUTHENTICATION` in `exchangeSsoToken`. */
    scope?: string;
  }): Promise<HttpResponse>;
  ssoProfile(body: { accessToken: string }): Promise<HttpResponse>;
};

export function createAuthHttpHandlers(deps: AuthHttpDeps): AuthHttpHandlers {
  return {
    async exchangeSso(body) {
      return toHttpResponse(
        await exchangeSsoToken(deps, {
          exchangeCode: body.exchangeCode,
          ...(body.scope !== undefined ? { scope: body.scope } : {}),
        }),
      );
    },
    async ssoProfile(body) {
      return toHttpResponse(
        await getSsoCitizenProfile(deps, {
          accessToken: body.accessToken,
        }),
      );
    },
  };
}
