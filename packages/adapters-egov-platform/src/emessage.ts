import type {
  EMessagePort,
  EMessageSmsPushInput,
  EMessageSmsPushResult,
} from "@egov/application";
import { ok, type Result } from "@egov/shared";
import {
  DEFAULT_BASE_URLS,
  envOrDefault,
  platformFetch,
  requireEnv,
  type PlatformEnv,
} from "./http.js";

export function createEMessageAdapter(env: PlatformEnv): EMessagePort {
  const base = () =>
    envOrDefault(env, "EMESSAGE_BASE_URL", DEFAULT_BASE_URLS.emessage);

  return {
    async pushSms(
      input: EMessageSmsPushInput,
    ): Promise<Result<EMessageSmsPushResult>> {
      const auth = requireEnv(env, "EMESSAGE_AUTH_TOKEN");
      if (!auth.ok) return auth;

      const res = await platformFetch(`${base()}/messaging/v1/sms/push`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "X-EMESSAGE-Auth": auth.value,
        },
        body: JSON.stringify({
          to: input.to,
          message: input.message,
          ...input.meta,
        }),
      });
      if (!res.ok) return res;
      return ok({ raw: res.value.json });
    },
  };
}
