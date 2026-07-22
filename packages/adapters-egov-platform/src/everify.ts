import type {
  EVerifyAuthResult,
  EVerifyPort,
  EVerifyQueryInput,
  EVerifyQueryResult,
  PlatformJson,
} from "@egov/application";
import { appError, err, ok, type Result } from "@egov/shared";
import {
  DEFAULT_BASE_URLS,
  envOrDefault,
  platformFetch,
  requireEnv,
  type PlatformEnv,
} from "./http.js";

/**
 * Official eVerify auth wraps the token under `data`:
 * `{ "data": { "access_token", "token_type", "expires_at" } }`.
 * Flat `access_token` / `token` kept as fallbacks for older shapes.
 */
export function extractEVerifyAccessToken(
  json: Record<string, unknown>,
): string {
  const data = json.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const nested = data as Record<string, unknown>;
    const fromData = nested.access_token ?? nested.token;
    if (fromData != null && String(fromData).length > 0) {
      return String(fromData);
    }
  }
  return String(json.access_token ?? json.token ?? "");
}

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
      const token = extractEVerifyAccessToken(res.value.json);
      if (!token.trim()) {
        return err(appError("UNAVAILABLE", "eVerify auth response did not contain data.access_token"));
      }
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
