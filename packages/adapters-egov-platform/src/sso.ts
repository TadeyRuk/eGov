import type {
  EgovSsoCitizenProfile,
  EgovSsoPort,
  EgovSsoToken,
  EgovSsoTokenRequest,
} from "@egov/application";
import { ok, type Result } from "@egov/shared";
import {
  DEFAULT_BASE_URLS,
  envOrDefault,
  platformFetch,
  requireEnv,
  type PlatformEnv,
} from "./http.js";

export function createEgovSsoAdapter(env: PlatformEnv): EgovSsoPort {
  const base = () =>
    envOrDefault(env, "EGOV_SSO_BASE_URL", DEFAULT_BASE_URLS.sso);

  return {
    async exchangeToken(
      input: EgovSsoTokenRequest,
    ): Promise<Result<EgovSsoToken>> {
      const partnerCode = requireEnv(env, "EGOV_SSO_PARTNER_CODE");
      if (!partnerCode.ok) return partnerCode;
      const partnerSecret = requireEnv(env, "EGOV_SSO_PARTNER_SECRET");
      if (!partnerSecret.ok) return partnerSecret;

      const res = await platformFetch(`${base()}/api/token`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          exchange_code: input.exchangeCode,
          scope: input.scope,
          partner_code: partnerCode.value,
          partner_secret: partnerSecret.value,
        }),
      });
      if (!res.ok) return res;

      const accessToken = String(
        res.value.json.access_token ?? res.value.json.accessToken ?? "",
      );
      const tokenType =
        typeof res.value.json.token_type === "string"
          ? res.value.json.token_type
          : undefined;
      const expiresIn =
        typeof res.value.json.expires_in === "number"
          ? res.value.json.expires_in
          : undefined;
      return ok({
        accessToken,
        raw: res.value.json,
        ...(tokenType !== undefined ? { tokenType } : {}),
        ...(expiresIn !== undefined ? { expiresIn } : {}),
      });
    },

    async authenticatePartner(
      accessToken: string,
    ): Promise<Result<EgovSsoCitizenProfile>> {
      const res = await platformFetch(`${base()}/api/partner/sso_authentication`, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
        },
      });
      if (!res.ok) return res;
      return ok({ raw: res.value.json });
    },
  };
}
