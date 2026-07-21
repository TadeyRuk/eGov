import type {
  EgovPayGenerateInput,
  EgovPayPort,
  EgovPayTransaction,
  PlatformJson,
} from "@egov/application";
import { ok, type Result } from "@egov/shared";
import {
  DEFAULT_BASE_URLS,
  envOrDefault,
  hmacSha256Hex,
  platformFetch,
  requireEnvAny,
  type PlatformEnv,
} from "./http.js";

export function createEgovPayAdapter(env: PlatformEnv): EgovPayPort {
  const base = () =>
    envOrDefault(env, "EGOVPAY_BASE_URL", DEFAULT_BASE_URLS.egovPay);

  /** Dashboard issues `EGOVPAY_API_KEY`; legacy placeholders remain as fallbacks. */
  function payToken() {
    return requireEnvAny(env, ["EGOVPAY_API_KEY", "EGOVPAY_TOKEN"]);
  }

  /**
   * Prefer dedicated HMAC secret; if the dashboard only issued an API key,
   * sign with that same key (no invented secret).
   */
  function payHmacSecret() {
    return requireEnvAny(env, [
      "EGOVPAY_HMAC_SECRET",
      "EGOVPAY_API_KEY",
      "EGOVPAY_TOKEN",
    ]);
  }

  async function signedHeaders(body: string): Promise<Result<Record<string, string>>> {
    const token = payToken();
    if (!token.ok) return token;
    const secret = payHmacSecret();
    if (!secret.ok) return secret;
    const digest = await hmacSha256Hex(secret.value, body);
    return ok({
      "content-type": "application/json",
      accept: "application/json",
      "X-eGovPay-Token": token.value,
      "X-eGovPay-Digest": digest,
    });
  }

  function asTx(json: Record<string, unknown>): EgovPayTransaction {
    const transactionId = String(
      json.transaction_id ?? json.transactionId ?? json.id ?? "",
    );
    return {
      ...(transactionId ? { transactionId } : {}),
      raw: json,
    };
  }

  return {
    async generatePayment(
      input: EgovPayGenerateInput,
    ): Promise<Result<EgovPayTransaction>> {
      const settlementTemplateUuid = env
        .get("EGOVPAY_SETTLEMENT_TEMPLATE_UUID")
        ?.trim();
      const payload =
        settlementTemplateUuid &&
        input.payload.settlement_template_uuid == null &&
        input.payload.settlementTemplateUuid == null
          ? { ...input.payload, settlement_template_uuid: settlementTemplateUuid }
          : input.payload;
      const body = JSON.stringify(payload);
      const headers = await signedHeaders(body);
      if (!headers.ok) return headers;
      const res = await platformFetch(`${base()}/transaction/generate`, {
        method: "POST",
        headers: headers.value,
        body,
      });
      if (!res.ok) return res;
      return ok(asTx(res.value.json));
    },

    async getTransaction(
      transactionId: string,
    ): Promise<Result<EgovPayTransaction>> {
      const headers = await signedHeaders("");
      if (!headers.ok) return headers;
      const res = await platformFetch(
        `${base()}/transaction/${encodeURIComponent(transactionId)}`,
        { method: "GET", headers: headers.value },
      );
      if (!res.ok) return res;
      return ok(asTx(res.value.json));
    },

    async voidTransaction(
      transactionId: string,
      payload: PlatformJson = {},
    ): Promise<Result<EgovPayTransaction>> {
      const body = JSON.stringify(payload);
      const headers = await signedHeaders(body);
      if (!headers.ok) return headers;
      const res = await platformFetch(
        `${base()}/transaction/${encodeURIComponent(transactionId)}/void`,
        { method: "POST", headers: headers.value, body },
      );
      if (!res.ok) return res;
      return ok(asTx(res.value.json));
    },
  };
}
