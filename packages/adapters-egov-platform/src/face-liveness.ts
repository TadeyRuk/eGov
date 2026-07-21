import type {
  FaceLivenessPort,
  FaceLivenessResult,
  FaceLivenessSession,
  PlatformJson,
} from "@egov/application";
import { isFaceLivenessPassed } from "@egov/application";
import { ok, type Result } from "@egov/shared";
import {
  DEFAULT_BASE_URLS,
  envOrDefault,
  platformFetch,
  requireEnv,
  type PlatformEnv,
} from "./http.js";

export function createFaceLivenessAdapter(env: PlatformEnv): FaceLivenessPort {
  const base = () =>
    envOrDefault(env, "FACE_LIVENESS_BASE_URL", DEFAULT_BASE_URLS.faceLiveness);

  function authHeaders(): Result<Record<string, string>> {
    const key = requireEnv(env, "FACE_LIVENESS_API_KEY");
    if (!key.ok) return key;
    return ok({
      "content-type": "application/json",
      accept: "application/json",
      "x-api-key": key.value,
    });
  }

  return {
    async createSession(
      payload: PlatformJson = {},
    ): Promise<Result<FaceLivenessSession>> {
      const headers = authHeaders();
      if (!headers.ok) return headers;
      const res = await platformFetch(`${base()}/v1/liveness/session`, {
        method: "POST",
        headers: headers.value,
        body: JSON.stringify(payload),
      });
      if (!res.ok) return res;
      const sessionId = String(res.value.json.token ?? res.value.json.session_id ?? "");
      return ok({ sessionId, raw: res.value.json });
    },

    async getResult(sessionId: string): Promise<Result<FaceLivenessResult>> {
      const headers = authHeaders();
      if (!headers.ok) return headers;
      const res = await platformFetch(
        `${base()}/v1/liveness/result/${encodeURIComponent(sessionId)}`,
        { method: "GET", headers: headers.value },
      );
      if (!res.ok) return res;
      const status = String(res.value.json.status ?? "");
      const confidenceRaw =
        res.value.json.confidence_score ?? res.value.json.confidence;
      const confidence =
        typeof confidenceRaw === "number"
          ? confidenceRaw
          : typeof confidenceRaw === "string"
            ? Number(confidenceRaw)
            : null;
      const conf =
        confidence !== null && Number.isFinite(confidence) ? confidence : null;
      return ok({
        status,
        confidence: conf,
        passed: isFaceLivenessPassed(status, conf),
        raw: res.value.json,
      });
    },
  };
}
