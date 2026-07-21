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
  type DbmCompassPort,
  type EgovAiPort,
  type EgovChainPort,
  type EgovPayPort,
  type EMessagePort,
  type EReportPort,
  type EVerifyPort,
  type FaceLivenessResult,
  type HashPort,
} from "../ports/index.js";

// ─── findEligibleBenefits ───────────────────────────────────────────────────
//
// Fund-check runs first, independent of any one citizen: only benefits whose
// DBM Compass check confirms funding are candidates. Eligibility matching is
// then scoped to that fundable list. This ordering means a citizen is never
// told they're eligible for a benefit that turns out unfunded — see
// docs/architecture.md "Product Vision" BANGON section.

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

async function fundableBenefits(
  deps: Pick<FindEligibleBenefitsDeps, "benefits" | "dbmCompass">,
): Promise<Result<readonly Benefit[]>> {
  const all = await deps.benefits.listAll();
  if (!all.ok) return all;

  const fundable: Benefit[] = [];
  for (const benefit of all.value) {
    const fundCheck = await deps.dbmCompass.query({
      dataset: benefit.fundCheck.dataset,
      query: benefit.fundCheck.query as Record<string, string | number | boolean>,
    });
    // Fail closed on transport/auth errors. `ok` means the GET /api/v1/records/*
    // call succeeded — interpreting cascade/totals for "enough budget" can be
    // tightened once seed fundCheck params are agency-specific.
    if (fundCheck.ok) fundable.push(benefit);
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
//
// eMessage is a plain sender (see docs/platform-apis.md and
// packages/adapters-egov-platform/src/emessage.ts) — no links, no OTPs.
// This use case only sends the in-app-redirect style message; it does not
// carry the benefit decision itself.

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
//
// Only called for financial benefits, only after eligibility + fund-check
// have already passed. This use case does not re-verify eligibility — the
// caller composes findEligibleBenefits -> disburseBenefit in order.

export type DisburseBenefitDeps = {
  readonly eGovPay: EgovPayPort;
};

export type DisburseBenefitInput = {
  readonly citizenId: CitizenId;
  readonly benefit: Benefit;
  /** Total amount for eGovPay `amount` + default line item. */
  readonly amount: number;
  readonly redirectUrl: string;
  readonly callbackUrl: string;
  /** Merchant txn id; defaults to a bangon-scoped unique string. */
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
      redirect_url: input.redirectUrl,
      callback_url: input.callbackUrl,
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
// Gated on Face Liveness API first: eVerify is never called unless the supplied
// FaceLivenessResult already passed (SUCCEEDED + confidence >= 95.0, per
// isFaceLivenessPassed). Callers should also put eVerify Tier Web SDK
// `face_liveness_session_id` (and demographics) inside `payload` for `/api/query`
// — that field is distinct from the Face Liveness API session used for this gate.

export type ConfirmCitizenIdentityDeps = {
  readonly eVerify: EVerifyPort;
};

export type ConfirmCitizenIdentityInput = {
  readonly token: string;
  readonly payload: Record<string, unknown>;
  readonly liveness: FaceLivenessResult;
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

  const verified = await deps.eVerify.verifyPersonalInfo({
    token: input.token,
    payload: input.payload,
  });
  if (!verified.ok) return verified;

  const raw = verified.value.raw;
  const dob = raw.date_of_birth ?? raw.dateOfBirth;
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
    // Uppercase so seed rules ("ALIVE") match eVerify casing variants.
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
// Anchors a hash of {citizenId, benefitId, matchedAt} on eGovChain — not the
// raw match record — matching docs/architecture.md's existing pattern
// ("a cryptographic proof (hash) is anchored... state validation is publicly
// verifiable... no agency can alter audit logs retroactively"). Uses the
// generic JSON-RPC `call`, not an eth_* helper, since none of the documented
// eth_* helpers (eth_call, eth_sendRawTransaction, eth_getTransactionReceipt,
// eth_blockNumber, eth_getBalance) are a write-anchor primitive by
// themselves — the exact anchoring RPC method is platform-specific and not
// enumerated in docs/platform-apis.md, so this calls a placeholder method
// name that must be confirmed against the dashboard's OpenAPI before this
// is used against the live chain (see docs/tasks.md Phase 0.5 "Align
// adapter path maps with live OpenAPI from the dashboard").

export type AnchorBenefitMatchDeps = {
  readonly eGovChain: EgovChainPort;
  readonly hash: HashPort;
};

export type AnchorBenefitMatchInput = {
  readonly match: BenefitMatch;
};

export async function anchorBenefitMatch(
  deps: AnchorBenefitMatchDeps,
  input: AnchorBenefitMatchInput,
): Promise<Result<{ hash: string }>> {
  const hash = await deps.hash.sha256Hex(
    JSON.stringify({
      citizenId: input.match.citizenId,
      benefitId: input.match.benefitId,
      matchedAt: input.match.matchedAt.toISOString(),
    }),
  );

  const anchored = await deps.eGovChain.call({
    method: "egov_anchorHash",
    params: [hash],
  });
  if (!anchored.ok) return anchored;
  return ok({ hash });
}

// ─── explainEligibility ─────────────────────────────────────────────────────
//
// Called strictly AFTER a match is already decided by isEligibleForBenefit —
// cosmetic/side-effect only, per confirmed decision. This never influences
// the eligibility outcome; a failure here does not undo or block the match.

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
//
// Explicit, citizen-initiated complaint: "I was matched but never received
// this benefit." Same eReport port/mechanism as the existing corruption/
// discrepancy reporting (Workflow 2 in the pitch doc) — not a separate
// system. No automatic/time-based trigger.
//
// eReport's fixed report-type catalog (crime, red_tape, scam, child_abuse,
// women_abuse, overpricing, fire, accident, gas_station_concerns) has no
// exact "benefit not delivered" category. Mapped to "red_tape" — the closest
// fit for a government-service delay/failure — a judgment call, not an
// officially sanctioned category; revisit if eReport ever adds one.
//
// Submit Complaint's own auth is the integration access_token only; the
// separate OTP -> report_view_token flow is only required to list/view
// report history afterward, not to submit one — so this use case does not
// depend on OTP.

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
