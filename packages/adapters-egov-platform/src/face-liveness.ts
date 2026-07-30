import type {
  FaceLivenessPort,
  FaceLivenessResult,
  FaceLivenessSession,
  PlatformJson,
} from "@egov/application";
import { isFaceLivenessPassed } from "@egov/application";
import { appError, err, ok, type Result } from "@egov/shared";
import {
  DEFAULT_BASE_URLS,
  envOrDefault,
  platformFetch,
  requireEnv,
  type PlatformEnv,
} from "./http.js";

/** Paths and auth confirmed against the live dashboard API reference
 * (platforms.e.gov.ph/dashboard/api-catalogs/face-liveness), 2026-07-22 —
 * corrects an earlier guessed `/api/session` path that 404'd against the
 * live platform. Auth is `x-api-key`, not a Bearer token. */
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
    async createSession(input): Promise<Result<FaceLivenessSession>> {
      const headers = authHeaders();
      if (!headers.ok) return headers;

      const body: PlatformJson = { action: input.action };
      if (input.callbackUrl !== undefined) body.callback_url = input.callbackUrl;
      if (input.delay !== undefined) body.delay = input.delay;

      // Hackathon Face Liveness flakes with transient fetch failures (~503 UNAVAILABLE).
      let lastError: Result<FaceLivenessSession> | undefined;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const res = await platformFetch(`${base()}/v1/liveness/session`, {
          method: "POST",
          headers: headers.value,
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const token = String(res.value.json.token ?? "");
          const url = String(res.value.json.url ?? "");
          return ok({ token, url, raw: res.value.json });
        }
        lastError = res;
        if (res.error.code !== "UNAVAILABLE" || attempt === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
      return (
        lastError ??
        err(appError("UNAVAILABLE", "Face Liveness session create failed"))
      );
    },

    async getResult(sessionToken: string): Promise<Result<FaceLivenessResult>> {
      const headers = authHeaders();
      if (!headers.ok) return headers;

      const res = await platformFetch(
        `${base()}/v1/liveness/result/${encodeURIComponent(sessionToken)}`,
        { method: "GET", headers: headers.value },
      );
      if (!res.ok) return res;

      const status = String(res.value.json.status ?? "");
      const confidenceRaw = res.value.json.confidence_score;
      const confidence =
        typeof confidenceRaw === "number"
          ? confidenceRaw
          : typeof confidenceRaw === "string"
            ? Number(confidenceRaw)
            : null;
      const conf =
        confidence !== null && Number.isFinite(confidence) ? confidence : null;
      const referenceImageUrl = asString(res.value.json.reference_image_url);

      return ok({
        status,
        confidence: conf,
        passed: isFaceLivenessPassed(status, conf),
        ...(referenceImageUrl !== undefined ? { referenceImageUrl } : {}),
        raw: res.value.json,
      });
    },
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
