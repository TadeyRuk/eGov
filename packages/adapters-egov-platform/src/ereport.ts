import type {
  EReportPort,
  EReportRequest,
  EReportResponse,
  EReportTokenResult,
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

export function createEReportAdapter(env: PlatformEnv): EReportPort {
  const base = () =>
    envOrDefault(env, "EREPORT_BASE_URL", DEFAULT_BASE_URLS.eReport);

  function configuredToken(token?: string): Result<string> {
    if (token?.trim()) return ok(token.trim());
    return requireEnv(env, "EREPORT_ACCESS_TOKEN");
  }

  async function headers(token?: string): Promise<Result<Record<string, string>>> {
    const accessToken = configuredToken(token);
    if (!accessToken.ok) return accessToken;
    return ok({
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${accessToken.value}`,
    });
  }

  async function post(
    path: string,
    input?: EReportRequest,
  ): Promise<Result<EReportResponse>> {
    const h = await headers(input?.token);
    if (!h.ok) return h;
    const res = await platformFetch(`${base()}${path}`, {
      method: "POST",
      headers: h.value,
      body: JSON.stringify(input?.payload ?? {}),
    });
    if (!res.ok) return res;
    return ok({ raw: res.value.json });
  }

  async function get(
    path: string,
    input?: EReportRequest,
  ): Promise<Result<EReportResponse>> {
    const h = await headers(input?.token);
    if (!h.ok) return h;
    const res = await platformFetch(`${base()}${path}`, {
      method: "GET",
      headers: h.value,
    });
    if (!res.ok) return res;
    return ok({ raw: res.value.json });
  }

  return {
    datasets(input) {
      return get("/datasets", input);
    },
    async token(_credentials?: PlatformJson): Promise<Result<EReportTokenResult>> {
      const token = configuredToken();
      if (!token.ok) return token;
      return ok({ token: token.value, raw: { source: "configured_access_token" } });
    },
    submitComplaint(input) {
      return post("/submit_complaint", input);
    },
    verifyOtp(input) {
      return post("/otp/verify", input);
    },
    listReports(input) {
      return get("/reports", input);
    },
    viewReport(reportId, input) {
      return get(`/reports/${encodeURIComponent(reportId)}`, input);
    },
  };
}
