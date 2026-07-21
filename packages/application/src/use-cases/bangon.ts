import {
  isEligibleForBenefit,
  type Benefit,
  type BenefitMatch,
  type CitizenEligibilityProfile,
  type CitizenId,
} from "@egov/domain";
import { appError, err, newId, ok, type Result } from "@egov/shared";
import type {
  BenefitCatalogPort,
  Clock,
  DbmCompassPort,
  EgovPayPort,
  EMessagePort,
  EVerifyPort,
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
      query: benefit.fundCheck.query,
    });
    // Fail closed: if the fund-check call itself fails (network, auth,
    // platform unavailable), do not offer the benefit as a candidate.
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
      matches.push({
        id: newId("match"),
        citizenId: input.citizenId,
        benefitId: benefit.id,
        matchedAt: now,
      });
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
    to: input.citizenPhone,
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
  const tx = await deps.eGovPay.generatePayment({
    payload: {
      citizen_id: input.citizenId,
      benefit_id: input.benefit.id,
      agency: input.benefit.agency,
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
// Identity confirmation composes eVerify only. Face Liveness pass/fail is
// evaluated by the caller via isFaceLivenessPassed (see
// packages/application/src/ports/platform.ts) before this is invoked —
// this use case does not re-derive that rule.

export type ConfirmCitizenIdentityDeps = {
  readonly eVerify: EVerifyPort;
};

export type ConfirmCitizenIdentityInput = {
  readonly token: string;
  readonly payload: Record<string, unknown>;
};

export async function confirmCitizenIdentity(
  deps: ConfirmCitizenIdentityDeps,
  input: ConfirmCitizenIdentityInput,
): Promise<Result<CitizenEligibilityProfile>> {
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
  return ok({
    dateOfBirth: new Date(dob),
    civilStatus: String(raw.civil_status ?? raw.civilStatus ?? ""),
    vitalStatus: String(raw.vital_status ?? raw.vitalStatus ?? ""),
  });
}
