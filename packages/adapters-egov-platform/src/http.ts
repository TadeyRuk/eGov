import { appError, err, ok, type Result } from "@egov/shared";

export type PlatformEnv = {
  readonly get: (key: string) => string | undefined;
};

export const DEFAULT_BASE_URLS = {
  sso: "https://hackathon-sso.e.gov.ph",
  everify: "https://hackathon-everify-api.e.gov.ph",
  faceLiveness: "https://hackathon-face-liveness-api.e.gov.ph",
  emessage: "https://ws-message.e.gov.ph",
  egovAi: "https://egov-ai-core-ws.oueg.info",
  egovPay: "https://egovpay-pgi-ws-dev.oueg.info",
  egovChain: "https://hackathon-blockchain.e.gov.ph",
  eReport: "https://stg-ereport-ws.oueg.info",
  dbmCompass: "https://dbm-ws.oueg.info",
} as const;

export function requireEnv(
  env: PlatformEnv,
  key: string,
): Result<string> {
  const value = env.get(key)?.trim();
  if (!value) {
    return err(
      appError(
        "UNAVAILABLE",
        `Missing required env ${key}. Obtain credentials from https://platforms.e.gov.ph/dashboard`,
      ),
    );
  }
  return ok(value);
}

/** First non-empty among aliases (dashboard names + legacy placeholders). */
export function requireEnvAny(
  env: PlatformEnv,
  keys: readonly string[],
): Result<string> {
  for (const key of keys) {
    const value = env.get(key)?.trim();
    if (value) return ok(value);
  }
  return err(
    appError(
      "UNAVAILABLE",
      `Missing required env (tried ${keys.join(", ")}). Obtain credentials from https://platforms.e.gov.ph/dashboard`,
    ),
  );
}

export function envOrDefault(
  env: PlatformEnv,
  key: string,
  fallback: string,
): string {
  return env.get(key)?.trim() || fallback;
}

export async function platformFetch(
  url: string,
  init: RequestInit,
): Promise<Result<{ status: number; json: Record<string, unknown> }>> {
  try {
    const response = await fetch(url, init);
    const text = await response.text();
    let json: Record<string, unknown> = {};
    if (text.length > 0) {
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        json = { rawText: text };
      }
    }
    if (!response.ok) {
      return err(
        appError(
          response.status >= 500 ? "UNAVAILABLE" : "VALIDATION",
          `Platform HTTP ${response.status} for ${url}`,
          json,
        ),
      );
    }
    return ok({ status: response.status, json });
  } catch (cause) {
    return err(
      appError("UNAVAILABLE", `Platform request failed for ${url}`, cause),
    );
  }
}

/** HMAC-SHA256 hex digest for eGovPay (Node crypto). */
export async function hmacSha256Hex(
  secret: string,
  payload: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function processEnv(): PlatformEnv {
  return {
    get(key) {
      return process.env[key];
    },
  };
}
