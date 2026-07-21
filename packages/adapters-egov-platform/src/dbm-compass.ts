import type {
  DbmCompassDataset,
  DbmCompassParams,
  DbmCompassPort,
  DbmCompassQueryInput,
  DbmCompassQueryResult,
  DbmLgsfDashboardParams,
  DbmLgsfRecordsParams,
  DbmNcaRecordsParams,
  DbmSaaodbDashboardParams,
  DbmSaaodbEntitiesParams,
  DbmSaaodbRecordsParams,
  DbmSaroRecordsParams,
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

/** Official dashboard paths — GET /api/v1/records/… (not POST /saaodb/query). */
const RECORDS_PATH: Record<DbmCompassDataset, string> = {
  SAAODB: "/api/v1/records/saaodb",
  NCA: "/api/v1/records/nca",
  SARO: "/api/v1/records/saro",
  LGSF: "/api/v1/records/lgsf",
};

function toSearchParams(
  params: DbmCompassParams | Readonly<Record<string, string | number | boolean | undefined>>,
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    sp.set(key, String(value));
  }
  const qs = sp.toString();
  return qs.length > 0 ? `?${qs}` : "";
}

export function createDbmCompassAdapter(env: PlatformEnv): DbmCompassPort {
  const base = () =>
    envOrDefault(env, "DBM_COMPASS_BASE_URL", DEFAULT_BASE_URLS.dbmCompass);

  async function getJson(
    path: string,
    params: DbmCompassParams | Readonly<Record<string, string | number | boolean | undefined>>,
  ): Promise<Result<PlatformJson>> {
    const apiKey = requireEnv(env, "DBM_COMPASS_API_KEY");
    if (!apiKey.ok) return apiKey;

    const res = await platformFetch(`${base()}${path}${toSearchParams(params)}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "X-API-Key": apiKey.value,
      },
    });
    if (!res.ok) return res;
    return ok(res.value.json);
  }

  return {
    async query(
      input: DbmCompassQueryInput,
    ): Promise<Result<DbmCompassQueryResult>> {
      const raw = await getJson(RECORDS_PATH[input.dataset], input.query);
      if (!raw.ok) return raw;
      return ok({ dataset: input.dataset, raw: raw.value });
    },

    getSaaodbRecords(params: DbmSaaodbRecordsParams) {
      return getJson("/api/v1/records/saaodb", params);
    },

    getSaaodbDashboard(params: DbmSaaodbDashboardParams) {
      return getJson("/api/v1/records/saaodb/dashboard", params);
    },

    getSaaodbEntities(params: DbmSaaodbEntitiesParams) {
      return getJson("/api/v1/records/saaodb/entities", params);
    },

    getNcaRecords(params: DbmNcaRecordsParams) {
      return getJson("/api/v1/records/nca", params);
    },

    getSaroRecords(params: DbmSaroRecordsParams) {
      return getJson("/api/v1/records/saro", params);
    },

    getLgsfRecords(params: DbmLgsfRecordsParams) {
      return getJson("/api/v1/records/lgsf", params);
    },

    getLgsfDashboard(params: DbmLgsfDashboardParams) {
      return getJson("/api/v1/records/lgsf/dashboard", params);
    },
  };
}
