import {
  advanceCaseStatus,
  anchorBenefitMatch,
  attachDocument,
  completeSsoAuthentication,
  confirmCitizenIdentity,
  disburseBenefit,
  exchangeSsoToken,
  explainEligibility,
  findEligibleBenefits,
  getFaceLivenessResult,
  getServiceCase,
  getSsoCitizenProfile,
  listTransparencyProjects,
  notifyEligibility,
  reportBenefitNonDelivery,
  startFaceLivenessSession,
  submitServiceCase,
  type AdvanceServiceCaseDeps,
  type AnchorBenefitMatchDeps,
  type AttachDocumentDeps,
  type BenefitCatalogPort,
  type BenefitMatchRepository,
  type BenefitNotificationCategory,
  type BenefitNotificationRepository,
  type CompleteSsoAuthenticationDeps,
  type ConfirmCitizenIdentityDeps,
  type DisburseBenefitDeps,
  type ExplainEligibilityDeps,
  type FaceLivenessPort,
  type FaceLivenessSessionAction,
  type FindEligibleBenefitsDeps,
  type GetFaceLivenessResultDeps,
  type GetServiceCaseDeps,
  type ListTransparencyProjectsDeps,
  type NotifyEligibilityDeps,
  type ReportBenefitNonDeliveryDeps,
  type StartFaceLivenessSessionDeps,
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
    readonly notifications: BenefitNotificationRepository;
    /** Server-side liveness lookup — never trust client-supplied scores. */
    readonly faceLiveness: FaceLivenessPort;
  };

export type BangonHttpHandlers = {
  confirmIdentity(body: {
    token: string;
    /** Face Liveness API session token from createSession. */
    sessionToken?: string;
    /** Alias for sessionToken. */
    sessionId?: string;
    /** eVerify Face Liveness Web SDK `result.session_id`. */
    faceLivenessSessionId: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    middleName?: string;
    suffix?: string;
  }): Promise<HttpResponse>;
  findMatches(body: {
    citizenId: string;
    profile: { dateOfBirth: string; civilStatus: string; vitalStatus: string };
  }): Promise<HttpResponse>;
  notify(matchId: string, body: {
    citizenPhone: string;
    category?: BenefitNotificationCategory;
    contextKey?: string;
    requirements?: readonly string[];
    statusText?: string;
    actionText?: string;
    deadlineText?: string;
  }): Promise<HttpResponse>;
  disburse(
    matchId: string,
    body: {
      amount: number;
      redirectUrl?: string;
      callbackUrl?: string;
      txnid?: string;
      currency?: string;
    },
  ): Promise<HttpResponse>;
  anchor(matchId: string): Promise<HttpResponse>;
  explain(matchId: string): Promise<HttpResponse>;
  reportNonDelivery(body: {
    accessToken: string;
    citizenId: string;
    benefitId: string;
    benefitTitle: string;
    mobile: string;
    firstName: string;
    lastName: string;
    gender: string;
    email: string;
    description: string;
    regionCode: string;
    provinceCode: string;
    municipalityCode: string;
    barangayCode: string;
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
      const sessionToken = (body.sessionToken ?? body.sessionId ?? "").trim();
      if (sessionToken.length === 0) {
        return {
          status: 400,
          body: {
            error: {
              code: "VALIDATION",
              message: "sessionToken (or sessionId) is required",
            },
          },
        };
      }
      const liveness = await getFaceLivenessResult(deps, { sessionToken });
      if (!liveness.ok) return toHttpResponse(liveness);
      const profile = await confirmCitizenIdentity(deps, {
        token: body.token,
        liveness: liveness.value,
        faceLivenessSessionId: body.faceLivenessSessionId,
        firstName: body.firstName,
        lastName: body.lastName,
        birthDate: body.birthDate,
        ...(body.middleName !== undefined
          ? { middleName: body.middleName }
          : {}),
        ...(body.suffix !== undefined ? { suffix: body.suffix } : {}),
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
        recipientKey: loaded.value.match.citizenId,
        benefitTitle: loaded.value.benefit.title,
        contextKey: body.contextKey?.trim() || `${matchId}:${body.category ?? "QUALIFICATION_RESULT"}`,
        ...(body.category !== undefined ? { category: body.category } : {}),
        ...(body.requirements !== undefined ? { requirements: body.requirements } : {}),
        ...(body.statusText !== undefined ? { statusText: body.statusText } : {}),
        ...(body.actionText !== undefined ? { actionText: body.actionText } : {}),
        ...(body.deadlineText !== undefined ? { deadlineText: body.deadlineText } : {}),
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
        ...(body.redirectUrl !== undefined
          ? { redirectUrl: body.redirectUrl }
          : {}),
        ...(body.callbackUrl !== undefined
          ? { callbackUrl: body.callbackUrl }
          : {}),
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
        accessToken: body.accessToken,
        citizenId: createId<"CitizenId">(body.citizenId) as CitizenId,
        benefitId: createId<"BenefitId">(body.benefitId) as BenefitId,
        benefitTitle: body.benefitTitle,
        mobile: body.mobile,
        firstName: body.firstName,
        lastName: body.lastName,
        gender: body.gender,
        email: body.email,
        description: body.description,
        regionCode: body.regionCode,
        provinceCode: body.provinceCode,
        municipalityCode: body.municipalityCode,
        barangayCode: body.barangayCode,
      });
      return toHttpResponse(result);
    },
  };
}

// ─── Auth (citizen SSO) ───────────────────────────────────────────────────

export type AuthHttpDeps = CompleteSsoAuthenticationDeps;

export type AuthHttpHandlers = {
  exchangeSso(body: {
    exchangeCode: string;
    /** Defaults to `SSO_AUTHENTICATION` in `exchangeSsoToken`. */
    scope?: string;
  }): Promise<HttpResponse>;
  ssoProfile(body: { accessToken: string }): Promise<HttpResponse>;
  /** Preferred client endpoint: exchange and profile lookup stay server-side. */
  completeSso(body: {
    exchangeCode: string;
    scope?: string;
  }): Promise<HttpResponse>;
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
    async completeSso(body) {
      const result = await completeSsoAuthentication(
        deps,
        {
          exchangeCode: body.exchangeCode,
          ...(body.scope !== undefined ? { scope: body.scope } : {}),
        },
      );
      if (!result.ok) return toHttpResponse(result);
      return {
        status: 200,
        body: { authenticated: true, profile: result.value.raw },
      };
    },
  };
}

// ─── Face Liveness (session create + result poll) ─────────────────────────
//
// API key stays on the server. Android opens `url` in a WebView / Custom Tab,
// then polls GET result (or waits for redirect) before confirm-identity.

export type FaceLivenessHttpDeps = StartFaceLivenessSessionDeps &
  GetFaceLivenessResultDeps;

export type FaceLivenessHttpHandlers = {
  createSession(body: {
    action: FaceLivenessSessionAction;
    callbackUrl?: string;
    delay?: number;
  }): Promise<HttpResponse>;
  getResult(sessionToken: string): Promise<HttpResponse>;
};

export function createFaceLivenessHttpHandlers(
  deps: FaceLivenessHttpDeps,
): FaceLivenessHttpHandlers {
  return {
    async createSession(body) {
      const result = await startFaceLivenessSession(deps, {
        action: body.action,
        ...(body.callbackUrl !== undefined
          ? { callbackUrl: body.callbackUrl }
          : {}),
        ...(body.delay !== undefined ? { delay: body.delay } : {}),
      });
      if (result.ok) {
        return { status: 201, body: result.value };
      }
      return toHttpResponse(result);
    },
    async getResult(sessionToken) {
      return toHttpResponse(
        await getFaceLivenessResult(deps, { sessionToken }),
      );
    },
  };
}

// ─── DBM Compass (Transparency projects) ──────────────────────────────────

export type DbmHttpDeps = ListTransparencyProjectsDeps;

export type DbmHttpHandlers = {
  listTransparencyProjects(query: {
    programCode?: string;
    reportYear?: number;
    region?: string;
    province?: string;
    municipality?: string;
    page?: number;
    limit?: number;
  }): Promise<HttpResponse>;
};

export function createDbmHttpHandlers(deps: DbmHttpDeps): DbmHttpHandlers {
  return {
    async listTransparencyProjects(query) {
      return toHttpResponse(
        await listTransparencyProjects(deps, {
          ...(query.programCode !== undefined
            ? { programCode: query.programCode }
            : {}),
          ...(query.reportYear !== undefined
            ? { reportYear: query.reportYear }
            : {}),
          ...(query.region !== undefined ? { region: query.region } : {}),
          ...(query.province !== undefined ? { province: query.province } : {}),
          ...(query.municipality !== undefined
            ? { municipality: query.municipality }
            : {}),
          ...(query.page !== undefined ? { page: query.page } : {}),
          ...(query.limit !== undefined ? { limit: query.limit } : {}),
        }),
      );
    },
  };
}
