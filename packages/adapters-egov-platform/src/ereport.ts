import type {
  EReportComplaintInput,
  EReportComplaintResult,
  EReportDatasetItem,
  EReportListInput,
  EReportListedReport,
  EReportListResult,
  EReportOtpConfirmInput,
  EReportOtpConfirmResult,
  EReportOtpRequestInput,
  EReportOtpRequestResult,
  EReportPort,
  EReportTokenResult,
  EReportViewInput,
  EReportViewResult,
  PlatformJson,
} from "@egov/application";
import { ok, type Result } from "@egov/shared";
import {
  DEFAULT_BASE_URLS,
  envOrDefault,
  platformFetch,
  requireEnvAny,
  type PlatformEnv,
} from "./http.js";

/** Paths, auth, and body/response shapes confirmed against the live
 * dashboard API reference (platforms.e.gov.ph/dashboard/api-catalogs/
 * ereport), captured 2026-07-22 — replaces guessed `/datasets`,
 * `/submit_complaint`, `/otp/verify` paths that 404'd against the live
 * platform. Real base path prefix is `/api/integration`. */
export function createEReportAdapter(env: PlatformEnv): EReportPort {
  const base = () =>
    `${envOrDefault(env, "EREPORT_BASE_URL", DEFAULT_BASE_URLS.eReport)}/api/integration`;

  function bearer(accessToken: string): Record<string, string> {
    return {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${accessToken}`,
    };
  }

  function toDatasetItems(json: Record<string, unknown>): EReportDatasetItem[] {
    const data = Array.isArray(json.data) ? json.data : [];
    return data.map((item) => {
      const record = (item ?? {}) as Record<string, unknown>;
      return {
        id: String(record.id ?? ""),
        type: String(record.type ?? ""),
        attributes: (record.attributes ?? {}) as PlatformJson,
      };
    });
  }

  async function getDataset(
    accessToken: string,
    path: string,
  ): Promise<Result<readonly EReportDatasetItem[]>> {
    const res = await platformFetch(`${base()}${path}`, {
      method: "GET",
      headers: bearer(accessToken),
    });
    if (!res.ok) return res;
    return ok(toDatasetItems(res.value.json));
  }

  return {
    getReportTypes(accessToken) {
      return getDataset(accessToken, "/datasets/report_types");
    },
    getRegions(accessToken) {
      return getDataset(accessToken, "/datasets/regions");
    },
    getProvinces(accessToken, regionCode) {
      return getDataset(
        accessToken,
        `/datasets/provinces?region_code=${encodeURIComponent(regionCode)}`,
      );
    },
    getMunicipalities(accessToken, provinceCode) {
      return getDataset(
        accessToken,
        `/datasets/municipalities?province_code=${encodeURIComponent(provinceCode)}`,
      );
    },
    getBarangays(accessToken, municipalityCode) {
      return getDataset(
        accessToken,
        `/datasets/barangays?municipality_code=${encodeURIComponent(municipalityCode)}`,
      );
    },

    async generateToken(accessCode: string): Promise<Result<EReportTokenResult>> {
      const res = await platformFetch(`${base()}/token`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ access_code: accessCode }),
      });
      if (!res.ok) return res;
      const accessToken = String(res.value.json.access_token ?? "");
      const expiresAt =
        typeof res.value.json.expires_at === "string"
          ? res.value.json.expires_at
          : undefined;
      return ok({
        accessToken,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
        raw: res.value.json,
      });
    },

    async submitComplaint(
      input: EReportComplaintInput,
    ): Promise<Result<EReportComplaintResult>> {
      const body: PlatformJson = {
        mobile: input.mobile,
        first_name: input.firstName,
        last_name: input.lastName,
        gender: input.gender,
        complainant_email: input.complainantEmail,
        report_type: input.reportType,
        subject: input.subject,
        message: input.message,
        region_code: input.regionCode,
        province_code: input.provinceCode,
        municipality_code: input.municipalityCode,
        barangay_code: input.barangayCode,
      };
      if (input.evidences !== undefined) body.evidences = input.evidences;
      if (input.latitude !== undefined) body.latitude = input.latitude;
      if (input.longitude !== undefined) body.longitude = input.longitude;

      const res = await platformFetch(`${base()}/submit_complaint`, {
        method: "POST",
        headers: bearer(input.accessToken),
        body: JSON.stringify(body),
      });
      if (!res.ok) return res;
      return ok({
        code: typeof res.value.json.code === "number" ? res.value.json.code : res.value.status,
        message: String(res.value.json.message ?? ""),
        caseNumber: String(res.value.json.case_number ?? ""),
        raw: res.value.json,
      });
    },

    async requestOtp(
      input: EReportOtpRequestInput,
    ): Promise<Result<EReportOtpRequestResult>> {
      const res = await platformFetch(`${base()}/verify/request`, {
        method: "POST",
        headers: bearer(input.accessToken),
        body: JSON.stringify({ email: input.email }),
      });
      if (!res.ok) return res;
      return ok({
        code: typeof res.value.json.code === "number" ? res.value.json.code : res.value.status,
        alreadyVerified: Boolean(res.value.json.already_verified),
        message: String(res.value.json.message ?? ""),
        raw: res.value.json,
      });
    },

    async confirmOtp(
      input: EReportOtpConfirmInput,
    ): Promise<Result<EReportOtpConfirmResult>> {
      const res = await platformFetch(`${base()}/verify/confirm`, {
        method: "POST",
        headers: bearer(input.accessToken),
        body: JSON.stringify({ email: input.email, otp: input.otp }),
      });
      if (!res.ok) return res;
      const expiresAt =
        typeof res.value.json.expires_at === "string"
          ? res.value.json.expires_at
          : undefined;
      return ok({
        code: typeof res.value.json.code === "number" ? res.value.json.code : res.value.status,
        reportViewToken: String(res.value.json.report_view_token ?? ""),
        ...(expiresAt !== undefined ? { expiresAt } : {}),
        raw: res.value.json,
      });
    },

    async listReports(input: EReportListInput): Promise<Result<EReportListResult>> {
      const params = new URLSearchParams();
      if (input.q !== undefined) params.set("q", input.q);
      if (input.page !== undefined) params.set("page", String(input.page));
      if (input.limit !== undefined) params.set("limit", String(input.limit));
      const qs = params.toString();

      const res = await platformFetch(
        `${base()}/reports${qs ? `?${qs}` : ""}`,
        {
          method: "GET",
          headers: {
            accept: "application/json",
            "X-EReport-View-Token": input.viewToken,
          },
        },
      );
      if (!res.ok) return res;

      const data = Array.isArray(res.value.json.data) ? res.value.json.data : [];
      const reports: EReportListedReport[] = data.map((item) => {
        const record = (item ?? {}) as Record<string, unknown>;
        const attributes = (record.attributes ?? {}) as Record<string, unknown>;
        return {
          id: String(record.id ?? ""),
          caseNumber: String(attributes.case_number ?? ""),
          status: String(attributes.status ?? ""),
          formattedStatus: String(attributes.formatted_status ?? ""),
          raw: attributes as PlatformJson,
        };
      });
      const meta = (res.value.json.meta ?? {}) as Record<string, unknown>;
      const pagination = (meta.pagination ?? {}) as Record<string, unknown>;
      return ok({
        reports,
        total: typeof pagination.total === "number" ? pagination.total : reports.length,
        currentPage: typeof pagination.current_page === "number" ? pagination.current_page : 1,
        totalPages: typeof pagination.total_pages === "number" ? pagination.total_pages : 1,
        raw: res.value.json,
      });
    },

    async viewReport(input: EReportViewInput): Promise<Result<EReportViewResult>> {
      const res = await platformFetch(
        `${base()}/reports/${encodeURIComponent(input.caseNumber)}`,
        {
          method: "GET",
          headers: {
            accept: "application/json",
            "X-EReport-View-Token": input.viewToken,
          },
        },
      );
      if (!res.ok) return res;

      const data = (res.value.json.data ?? {}) as Record<string, unknown>;
      return ok({
        id: String(data.id ?? ""),
        caseNumber: String(data.case_number ?? ""),
        status: String(data.status ?? ""),
        formattedStatus: String(data.formatted_status ?? ""),
        raw: res.value.json,
      });
    },
  };
}

/** Reads the pre-issued eReport integration access_code from env. Reuses
 * the existing dashboard-issued credential env vars — the dashboard's
 * "access_code" plays the same role as every other service's API key. */
export function eReportAccessCodeFromEnv(env: PlatformEnv): Result<string> {
  return requireEnvAny(env, ["EREPORT_ACCESS_TOKEN", "EREPORT_API_KEY"]);
}
