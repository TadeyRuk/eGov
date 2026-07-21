import type {
  EVerifyAuthResult,
  EVerifyPort,
  EVerifyQueryInput,
  EVerifyQueryResult,
  PlatformJson,
} from "@egov/application";
import { ok, type Result } from "@egov/shared";
import {
  DEFAULT_BASE_URLS,
  envOrDefault,
  platformFetch,
  requireEnv,
  type PlatformEnv,
} from "./http.js";

export function createEVerifyAdapter(env: PlatformEnv): EVerifyPort {
  const base = () =>
    envOrDefault(env, "EVERIFY_BASE_URL", DEFAULT_BASE_URLS.everify);

  async function authedPost(
    path: string,
    token: string,
    payload: PlatformJson,
  ): Promise<Result<EVerifyQueryResult>> {
    const res = await platformFetch(`${base()}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return res;
    return ok({ raw: res.value.json });
  }

  return {
    async authenticate(
      credentials?: PlatformJson,
    ): Promise<Result<EVerifyAuthResult>> {
      const clientId = requireEnv(env, "EVERIFY_CLIENT_ID");
      if (!clientId.ok) return clientId;
      const clientSecret = requireEnv(env, "EVERIFY_CLIENT_SECRET");
      if (!clientSecret.ok) return clientSecret;

      const res = await platformFetch(`${base()}/api/auth`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          client_id: clientId.value,
          client_secret: clientSecret.value,
          ...credentials,
        }),
      });
      if (!res.ok) return res;
      const token = String(
        res.value.json.token ?? res.value.json.access_token ?? "",
      );
      return ok({ token, raw: res.value.json });
    },

    verifyPersonalInfo(input) {
      return authedPost("/api/query", input.token, input.payload);
    },
    checkQr(input: EVerifyQueryInput) {
      return authedPost("/api/query/qr/check", input.token, input.payload);
    },
    verifyQr(input) {
      return authedPost("/api/query/qr", input.token, input.payload);
    },
  };
}
