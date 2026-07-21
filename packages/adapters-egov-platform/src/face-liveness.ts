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

export function createFaceLivenessAdapter(env: PlatformEnv): FaceLivenessPort {
  const base = () =>
    envOrDefault(env, "FACE_LIVENESS_BASE_URL", DEFAULT_BASE_URLS.faceLiveness);

  async function authHeaders(): Promise<Result<Record<string, string>>> {
    const key = requireEnv(env, "FACE_LIVENESS_API_KEY");
    if (!key.ok) return key;
    return ok({
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${key.value}`,
    });
  }

  return {
    async createSession(
      payload: PlatformJson = {},
    ): Promise<Result<FaceLivenessSession>> {
      const path = env.get("FACE_LIVENESS_CREATE_SESSION_PATH")?.trim();
      if (!path) {
        return err(appError("UNAVAILABLE", "Face Liveness create-session path is not confirmed; set FACE_LIVENESS_CREATE_SESSION_PATH from the official dashboard contract"));
      }
      const headers = await authHeaders();
      if (!headers.ok) return headers;
      const res = await platformFetch(`${base()}${path.startsWith("/") ? path : `/${path}`}`, {
        method: "POST",
        headers: headers.value,
        body: JSON.stringify(payload),
      });
      if (!res.ok) return res;
      const sessionId = String(
        res.value.json.session_id ?? res.value.json.sessionId ?? "",
      );
      return ok({ sessionId, raw: res.value.json });
    },

    async getResult(sessionId: string): Promise<Result<FaceLivenessResult>> {
      const template = env.get("FACE_LIVENESS_RESULT_PATH_TEMPLATE")?.trim();
      if (!template || !template.includes("{session_id}")) {
        return err(appError("UNAVAILABLE", "Face Liveness result path is not confirmed; set FACE_LIVENESS_RESULT_PATH_TEMPLATE with a {session_id} placeholder from the official dashboard contract"));
      }
      const headers = await authHeaders();
      if (!headers.ok) return headers;
      const path = template.replace("{session_id}", encodeURIComponent(sessionId));
      const res = await platformFetch(
        `${base()}${path.startsWith("/") ? path : `/${path}`}`,
        { method: "GET", headers: headers.value },
      );
      if (!res.ok) return res;
      const status = String(res.value.json.status ?? "");
      const confidenceRaw = res.value.json.confidence;
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
