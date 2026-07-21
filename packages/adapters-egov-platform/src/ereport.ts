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

  async function headers(token?: string): Promise<Result<Record<string, string>>> {
    const apiKey = requireEnv(env, "EREPORT_API_KEY");
    if (!apiKey.ok) return apiKey;
    const h: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      "X-API-Key": apiKey.value,
    };
    if (token) h.authorization = `Bearer ${token}`;
    return ok(h);
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
    async token(credentials?: PlatformJson): Promise<Result<EReportTokenResult>> {
      const result = await post("/token", { payload: credentials ?? {} });
      if (!result.ok) return result;
      const token = String(
        result.value.raw.token ?? result.value.raw.access_token ?? "",
      );
      return ok({ token, raw: result.value.raw });
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
