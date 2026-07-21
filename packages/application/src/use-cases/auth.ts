import { ok, type Result } from "@egov/shared";
import {
  EGOV_SSO_SCOPE_AUTHENTICATION,
  type EgovSsoCitizenProfile,
  type EgovSsoPort,
  type EgovSsoToken,
} from "../ports/index.js";
import { mapSsoCitizenProfile } from "./sso-profile.js";

export type ExchangeSsoTokenDeps = {
  readonly sso: EgovSsoPort;
};

export type ExchangeSsoTokenInput = {
  readonly exchangeCode: string;
  /** Defaults to `SSO_AUTHENTICATION` (official eGov SSO standard login scope). */
  readonly scope?: string;
};

/** Partner credentials stay in the SSO adapter env — Android only sends the code. */
export async function exchangeSsoToken(
  deps: ExchangeSsoTokenDeps,
  input: ExchangeSsoTokenInput,
): Promise<Result<EgovSsoToken>> {
  return deps.sso.exchangeToken({
    exchangeCode: input.exchangeCode,
    scope: input.scope ?? EGOV_SSO_SCOPE_AUTHENTICATION,
  });
}

export type GetSsoCitizenProfileDeps = {
  readonly sso: EgovSsoPort;
};

export type GetSsoCitizenProfileInput = {
  readonly accessToken: string;
};

export async function getSsoCitizenProfile(
  deps: GetSsoCitizenProfileDeps,
  input: GetSsoCitizenProfileInput,
): Promise<Result<EgovSsoCitizenProfile>> {
  const profile = await deps.sso.authenticatePartner(input.accessToken);
  if (!profile.ok) return profile;
  return ok(mapSsoCitizenProfile(profile.value.raw));
}
