import type {
  DbmCompassPort,
  DbmCompassQueryInput,
  DbmCompassQueryResult,
} from "@egov/application";
import { ok, type Result } from "@egov/shared";
import {
  DEFAULT_BASE_URLS,
  envOrDefault,
  platformFetch,
  requireEnv,
  type PlatformEnv,
} from "./http.js";

const DATASET_PATH: Record<DbmCompassQueryInput["dataset"], string> = {
  SAAODB: "/saaodb/query",
  NCA: "/nca/query",
  SARO: "/saro/query",
  LGSF: "/lgsf/query",
};

export function createDbmCompassAdapter(env: PlatformEnv): DbmCompassPort {
  const base = () =>
    envOrDefault(env, "DBM_COMPASS_BASE_URL", DEFAULT_BASE_URLS.dbmCompass);

  return {
    async query(
      input: DbmCompassQueryInput,
    ): Promise<Result<DbmCompassQueryResult>> {
      const apiKey = requireEnv(env, "DBM_COMPASS_API_KEY");
      if (!apiKey.ok) return apiKey;

      const res = await platformFetch(`${base()}${DATASET_PATH[input.dataset]}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "X-API-Key": apiKey.value,
        },
        body: JSON.stringify(input.query),
      });
      if (!res.ok) return res;
      return ok({ dataset: input.dataset, raw: res.value.json });
    },
  };
}
