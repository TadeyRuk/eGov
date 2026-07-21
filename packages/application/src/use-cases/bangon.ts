import {
  isEligibleForBenefit,
  type Benefit,
  type BenefitId,
  type BenefitMatch,
  type CitizenEligibilityProfile,
  type CitizenId,
  type EligibilityRule,
} from "@egov/domain";
import { appError, err, newId, ok, type Result } from "@egov/shared";
import {
  isFaceLivenessPassed,
  type BenefitCatalogPort,
  type BenefitMatchRepository,
  type Clock,
  type DbmCompassParams,
  type DbmCompassPort,
  type EgovAiPort,
  type EgovChainPort,
  type EgovPayPort,
  type EMessagePort,
  type EReportPort,
  type EVerifyPort,
  type FaceLivenessResult,
  type HashPort,
  type PlatformJson,
} from "../ports/index.js";
import { isFundedFromDbmResult } from "./dbm-fund.js";

// ─── findEligibleBenefits ───────────────────────────────────────────────────

export type FindEligibleBenefitsDeps = {
  readonly benefits: BenefitCatalogPort;
  readonly dbmCompass: DbmCompassPort;
  readonly clock: Clock;
  readonly matches: BenefitMatchRepository;
};

export type FindEligibleBenefitsInput = {
  readonly citizenId: CitizenId;
  readonly profile: CitizenEligibilityProfile;
};

function asQueryParams(query: Record<string, unknown>): DbmCompassParams {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(query)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
    }
  }
  return out;
}

async function runFundCheck(
  dbm: DbmCompassPort,
  benefit: Benefit,
): Promise<Result<PlatformJson>> {
  const params = asQueryParams(benefit.fundCheck.query);
  if (
    benefit.fundCheck.dataset === "SAAODB" &&
    benefit.fundCheck.mode === "dashboard"
  ) {
    const reportYear = Number(params.reportYear);
    const sheetScope = String(params.sheetScope ?? "summary");
    if (!Number.isFinite(reportYear)) {
      return err(
        appError(
          "VALIDATION",
          `Benefit ${benefit.id} SAAODB dashboard fundCheck requires reportYear`,
        ),
      );
    }
    return dbm.getSaaodbDashboard({ reportYear, sheetScope });
  }
  const res = await dbm.query({
    dataset: benefit.fundCheck.dataset,
    query: params,
  });
  if (!res.ok) return res;
  return ok(res.value.raw);
}

async function fundableBenefits(
  deps: Pick<FindEligibleBenefitsDeps, "benefits" | "dbmCompass">,
): Promise<Result<readonly Benefit[]>> {
  const all = await deps.benefits.listAll();
  if (!all.ok) return all;

  const fundable: Benefit[] = [];
  for (const benefit of all.value) {
    const fundCheck = await runFundCheck(deps.dbmCompass, benefit);
    // Fail closed on transport/auth/validation errors.
    if (!fundCheck.ok) return fundCheck;
    if (isFundedFromDbmResult(benefit.fundCheck.dataset, fundCheck.value)) {
      fundable.push(benefit);
    }
  }
  return ok(fundable);
}

export async function findEligibleBenefits(
  deps: FindEligibleBenefitsDeps,
  input: FindEligibleBenefitsInput,
): Promise<Result<readonly BenefitMatch[]>> {
  const fundable = await fundableBenefits(deps);
  if (!fundable.ok) return fundable;

  const now = deps.clock.now();
  const matches: BenefitMatch[] = [];
  for (const benefit of fundable.value) {
    if (isEligibleForBenefit(input.profile, benefit.rule, now)) {
      const match: BenefitMatch = {
        id: newId("match"),
        citizenId: input.citizenId,
        benefitId: benefit.id,
        matchedAt: now,
      };
      const saved = await deps.matches.save(match);
      if (!saved.ok) return saved;
      matches.push(saved.value);
    }
  }
  return ok(matches);
}

// ─── notifyEligibility ──────────────────────────────────────────────────────

export type NotifyEligibilityDeps = {
  readonly eMessage: EMessagePort;
};

export type NotifyEligibilityInput = {
  readonly citizenPhone: string;
  readonly benefitTitle: string;
};

export async function notifyEligibility(
  deps: NotifyEligibilityDeps,
  input: NotifyEligibilityInput,
): Promise<Result<void>> {
  const sent = await deps.eMessage.pushSms({
    number: input.citizenPhone,
    message: `eGov PH Alert: You may be eligible for ${input.benefitTitle}. Open the official BANGON app to view and confirm.`,
  });
  if (!sent.ok) return sent;
  return ok(undefined);
}

// ─── disburseBenefit ────────────────────────────────────────────────────────

export type DisburseBenefitDeps = {
  readonly eGovPay: EgovPayPort;
  /** From EGOVPAY_REDIRECT_URL when HTTP body omits redirectUrl. */
  readonly defaultRedirectUrl?: string;
  /** From EGOVPAY_CALLBACK_URL when HTTP body omits callbackUrl. */
  readonly defaultCallbackUrl?: string;
};

export type DisburseBenefitInput = {
  readonly citizenId: CitizenId;
  readonly benefit: Benefit;
  readonly amount: number;
  readonly redirectUrl?: string;
  readonly callbackUrl?: string;
  readonly txnid?: string;
  readonly currency?: string;
  readonly items?: readonly { readonly name: string; readonly amount: number }[];
};

export async function disburseBenefit(
  deps: DisburseBenefitDeps,
  input: DisburseBenefitInput,
): Promise<Result<{ transactionId?: string }>> {
  if (!input.benefit.isFinancial) {
    return err(
      appError(
        "VALIDATION",
        `Benefit ${input.benefit.id} is not financial; nothing to disburse`,
      ),
    );
  }
  const redirectUrl =
    input.redirectUrl?.trim() || deps.defaultRedirectUrl?.trim() || "";
  const callbackUrl =
    input.callbackUrl?.trim() || deps.defaultCallbackUrl?.trim() || "";
  if (!redirectUrl || !callbackUrl) {
    return err(
      appError(
        "VALIDATION",
        "disburse requires redirectUrl and callbackUrl (body or EGOVPAY_REDIRECT_URL / EGOVPAY_CALLBACK_URL)",
      ),
    );
  }
  const txnid =
    input.txnid?.trim() ||
    `bangon-${input.citizenId}-${input.benefit.id}-${Date.now()}`;
  const items = input.items ?? [
    { name: input.benefit.title, amount: input.amount },
  ];
  const tx = await deps.eGovPay.generatePayment({
    payload: {
      items,
      amount: input.amount,
      redirect_url: redirectUrl,
      callback_url: callbackUrl,
      txnid,
      ...(input.currency ? { currency: input.currency } : {}),
    },
  });
  if (!tx.ok) return tx;
  return ok(
    tx.value.transactionId
      ? { transactionId: tx.value.transactionId }
      : {},
  );
}

// ─── confirmCitizenIdentity ─────────────────────────────────────────────────
//
// Dual path: Face Liveness API gate (SUCCEEDED + confidence >= 95) AND eVerify
// Tier Web SDK session id on POST /api/query as face_liveness_session_id.

export type ConfirmCitizenIdentityDeps = {
  readonly eVerify: EVerifyPort;
};

export type ConfirmCitizenIdentityInput = {
  readonly token: string;
  readonly liveness: FaceLivenessResult;
  /** eVerify Face Liveness Web SDK `result.session_id`. */
  readonly faceLivenessSessionId: string;
  readonly firstName: string;
  readonly lastName: string;
  /** ISO `YYYY-MM-DD`. */
  readonly birthDate: string;
  readonly middleName?: string;
  readonly suffix?: string;
};

export async function confirmCitizenIdentity(
  deps: ConfirmCitizenIdentityDeps,
  input: ConfirmCitizenIdentityInput,
): Promise<Result<CitizenEligibilityProfile>> {
  if (
    !isFaceLivenessPassed(input.liveness.status, input.liveness.confidence)
  ) {
    return err(
      appError(
        "FORBIDDEN",
        "Face Liveness check did not pass (requires SUCCEEDED and confidence >= 95.0)",
      ),
    );
  }

  const faceLivenessSessionId = input.faceLivenessSessionId.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const birthDate = input.birthDate.trim();
  if (!faceLivenessSessionId || !firstName || !lastName || !birthDate) {
    return err(
      appError(
        "VALIDATION",
        "confirm-identity requires faceLivenessSessionId, firstName, lastName, birthDate",
      ),
    );
  }

  const payload: PlatformJson = {
    first_name: firstName,
    last_name: lastName,
    birth_date: birthDate,
    face_liveness_session_id: faceLivenessSessionId,
  };
  const middle = input.middleName?.trim();
  if (middle) payload.middle_name = middle;
  const suffix = input.suffix?.trim();
  if (suffix) payload.suffix = suffix;

  const verified = await deps.eVerify.verifyPersonalInfo({
    token: input.token,
    payload,
  });
  if (!verified.ok) return verified;

  const raw = verified.value.raw;
  const dob = raw.date_of_birth ?? raw.dateOfBirth ?? birthDate;
  if (typeof dob !== "string") {
    return err(
      appError("VALIDATION", "eVerify response missing date of birth"),
    );
  }
  const dateOfBirth = new Date(dob);
  if (Number.isNaN(dateOfBirth.getTime())) {
    return err(
      appError("VALIDATION", "eVerify response has invalid date of birth"),
    );
  }
  return ok({
    dateOfBirth,
    civilStatus: String(raw.civil_status ?? raw.civilStatus ?? "")
      .trim()
      .toUpperCase(),
    vitalStatus: String(raw.vital_status ?? raw.vitalStatus ?? "")
      .trim()
      .toUpperCase(),
  });
}

// ─── anchorBenefitMatch ─────────────────────────────────────────────────────
//
// Local SHA-256 of {citizenId, benefitId, matchedAt}. Optional live chain
// submit only when EGOVCHAIN_ANCHOR_METHOD is set (dashboard-documented RPC).
// Never invents method names like egov_anchorHash.

export type AnchorBenefitMatchDeps = {
  readonly eGovChain: EgovChainPort;
  readonly hash: HashPort;
  /** From env EGOVCHAIN_ANCHOR_METHOD — omit to hash-only. */
  readonly chainAnchorMethod?: string;
};

export type AnchorBenefitMatchInput = {
  readonly match: BenefitMatch;
};

export async function anchorBenefitMatch(
  deps: AnchorBenefitMatchDeps,
  input: AnchorBenefitMatchInput,
): Promise<Result<{ hash: string; chainSubmitted: boolean }>> {
  const hash = await deps.hash.sha256Hex(
    JSON.stringify({
      citizenId: input.match.citizenId,
      benefitId: input.match.benefitId,
      matchedAt: input.match.matchedAt.toISOString(),
    }),
  );

  const method = deps.chainAnchorMethod?.trim();
  if (!method) {
    return ok({ hash, chainSubmitted: false });
  }

  const anchored = await deps.eGovChain.call({
    method,
    params: [hash],
  });
  if (!anchored.ok) return anchored;
  return ok({ hash, chainSubmitted: true });
}

// ─── explainEligibility ─────────────────────────────────────────────────────

export type ExplainEligibilityDeps = {
  readonly egovAi: EgovAiPort;
};

export type ExplainEligibilityInput = {
  readonly benefitTitle: string;
  readonly rule: EligibilityRule;
};

export async function explainEligibility(
  deps: ExplainEligibilityDeps,
  input: ExplainEligibilityInput,
): Promise<Result<{ explanation: string }>> {
  const explained = await deps.egovAi.aiAssistant({
    prompt: `Explain in plain, simple language (suitable for a senior citizen) why someone qualifies for the benefit "${input.benefitTitle}". Eligibility rule: ${JSON.stringify(input.rule)}.`,
    category: "PH",
  });
  if (!explained.ok) return explained;

  return ok({ explanation: explained.value.data });
}

// ─── reportBenefitNonDelivery ───────────────────────────────────────────────

const NON_DELIVERY_REPORT_TYPE = "red_tape";

export type ReportBenefitNonDeliveryDeps = {
  readonly eReport: EReportPort;
};

export type ReportBenefitNonDeliveryInput = {
  readonly accessToken: string;
  readonly citizenId: CitizenId;
  readonly benefitId: BenefitId;
  readonly benefitTitle: string;
  readonly mobile: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly gender: string;
  readonly email: string;
  readonly description: string;
  readonly regionCode: string;
  readonly provinceCode: string;
  readonly municipalityCode: string;
  readonly barangayCode: string;
};

export async function reportBenefitNonDelivery(
  deps: ReportBenefitNonDeliveryDeps,
  input: ReportBenefitNonDeliveryInput,
): Promise<Result<{ caseNumber: string }>> {
  const submitted = await deps.eReport.submitComplaint({
    accessToken: input.accessToken,
    mobile: input.mobile,
    firstName: input.firstName,
    lastName: input.lastName,
    gender: input.gender,
    complainantEmail: input.email,
    reportType: NON_DELIVERY_REPORT_TYPE,
    subject: `Benefit not received: ${input.benefitTitle}`,
    message: `Citizen ${input.citizenId} was matched to benefit ${input.benefitId} ("${input.benefitTitle}") but reports it was never received. ${input.description}`,
    regionCode: input.regionCode,
    provinceCode: input.provinceCode,
    municipalityCode: input.municipalityCode,
    barangayCode: input.barangayCode,
  });
  if (!submitted.ok) return submitted;
  return ok({ caseNumber: submitted.value.caseNumber });
}
