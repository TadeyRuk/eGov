import type {
  EMessagePort,
  EMessageSmsPushInput,
  EMessageSmsPushResult,
} from "@egov/application";
import { appError, err, ok, type Result } from "@egov/shared";
import {
  DEFAULT_BASE_URLS,
  envOrDefault,
  platformFetch,
  requireEnv,
  type PlatformEnv,
} from "./http.js";

const URL_PATTERN = /(https?:\/\/|www\.)\S+/i;
const OTP_PATTERN = /\b(?:OTP|one[- ]?time (?:password|code|pin)|verification code)\b/i;

/** Anti-phishing guard: eMessage is a plain sender, the platform does not
 * inspect content, so link/OTP stripping must happen before the API call. */
export function checkSmsContent(message: string): Result<void> {
  if (URL_PATTERN.test(message)) {
    return err(
      appError(
        "VALIDATION",
        "SMS message must not contain links or URLs (anti-phishing policy)",
      ),
    );
  }
  if (OTP_PATTERN.test(message)) {
    return err(
      appError(
        "VALIDATION",
        "SMS message must not contain OTPs or reference verification codes (anti-phishing policy)",
      ),
    );
  }
  return ok(undefined);
}

export function createEMessageAdapter(env: PlatformEnv): EMessagePort {
  const base = () =>
    envOrDefault(env, "EMESSAGE_BASE_URL", DEFAULT_BASE_URLS.emessage);

  return {
    async pushSms(
      input: EMessageSmsPushInput,
    ): Promise<Result<EMessageSmsPushResult>> {
      const contentCheck = checkSmsContent(input.message);
      if (!contentCheck.ok) return contentCheck;

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
