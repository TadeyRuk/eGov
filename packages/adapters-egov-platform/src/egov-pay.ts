import type {
  EgovPayGenerateInput,
  EgovPayPort,
  EgovPayTransaction,
  PlatformJson,
} from "@egov/application";
import { appError, err, ok, type Result } from "@egov/shared";
import {
  DEFAULT_BASE_URLS,
  envOrDefault,
  hmacSha256Hex,
  platformFetch,
  requireEnvAny,
  type PlatformEnv,
} from "./http.js";

/**
 * Live-verified (2026-07-22, dashboard "Test" tab): the platform strips a
 * `test_` prefix from the API token before using it as the HMAC digest key,
 * despite the docs saying the digest is "keyed by the API token" with no
 * mention of stripping. Using the raw prefixed token returns 422
 * "The digest is not valid." — confirmed by reproducing the failure via the
 * dashboard's own request tester with a manually-verified-correct digest.
 */
export function eGovPayDigestKeyFromToken(token: string): string {
  return token.replace(/^test_/, "");
}

export function createEgovPayAdapter(env: PlatformEnv): EgovPayPort {
  const base = () =>
    envOrDefault(env, "EGOVPAY_BASE_URL", DEFAULT_BASE_URLS.egovPay);

  /** Dashboard issues `EGOVPAY_API_KEY`; legacy placeholders remain as fallbacks. */
  function payToken() {
    return requireEnvAny(env, ["EGOVPAY_API_KEY", "EGOVPAY_TOKEN"]);
  }

  /** See `eGovPayDigestKeyFromToken` for why the `test_` prefix is stripped. */
  function digestKey(): Result<string> {
    const key = requireEnvAny(env, [
      "EGOVPAY_HMAC_SECRET",
      "EGOVPAY_API_KEY",
      "EGOVPAY_TOKEN",
    ]);
    if (!key.ok) return key;
    return ok(eGovPayDigestKeyFromToken(key.value));
  }

  function authHeaders(): Result<Record<string, string>> {
    const token = payToken();
    if (!token.ok) return token;
    return ok({
      "content-type": "application/json; charset=utf-8",
      accept: "application/json",
      "X-eGovPay-Token": token.value,
    });
  }

  function asTx(json: Record<string, unknown>): EgovPayTransaction {
    const data =
      json.data != null &&
      typeof json.data === "object" &&
      !Array.isArray(json.data)
        ? (json.data as Record<string, unknown>)
        : json;
    const transactionId = String(
      data.uuid ?? data.transaction_id ?? data.transactionId ?? data.id ?? "",
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
      const headers = authHeaders();
      if (!headers.ok) return headers;
      const key = digestKey();
      if (!key.ok) return key;

      const settlementTemplateUuid = env
        .get("EGOVPAY_SETTLEMENT_TEMPLATE_UUID")
        ?.trim();
      const payload: Record<string, unknown> = { ...input.payload };
      if (
        settlementTemplateUuid &&
        payload.settlement_template_uuid == null &&
        payload.settlementTemplateUuid == null
      ) {
        payload.settlement_template_uuid = settlementTemplateUuid;
      }

      const amount = payload.amount;
      const txnid = payload.txnid;
      if (
        amount == null ||
        txnid == null ||
        String(txnid).trim().length === 0
      ) {
        return err(
          appError(
            "VALIDATION",
            "eGovPay generatePayment requires amount and txnid for HMAC digest ($amount|$txnid)",
          ),
        );
      }

      // Dashboard: hash_hmac('sha256', "$amount|$txnid", $token) — body field, not a header.
      payload.digest = await hmacSha256Hex(key.value, `${amount}|${txnid}`);

      const res = await platformFetch(`${base()}/api/v1/transaction`, {
        method: "POST",
        headers: headers.value,
        body: JSON.stringify(payload),
      });
      if (!res.ok) return res;
      return ok(asTx(res.value.json));
    },

    async getTransaction(
      transactionId: string,
    ): Promise<Result<EgovPayTransaction>> {
      const headers = authHeaders();
      if (!headers.ok) return headers;
      const res = await platformFetch(
        `${base()}/api/v1/transaction/${encodeURIComponent(transactionId)}`,
        { method: "GET", headers: headers.value },
      );
      if (!res.ok) return res;
      return ok(asTx(res.value.json));
    },

    async voidTransaction(
      transactionId: string,
      payload: PlatformJson = {},
    ): Promise<Result<EgovPayTransaction>> {
      const headers = authHeaders();
      if (!headers.ok) return headers;
      const hasBody = Object.keys(payload).length > 0;
      const res = await platformFetch(
        `${base()}/api/v1/transaction/${encodeURIComponent(transactionId)}/void`,
        {
          method: "PUT",
          headers: headers.value,
          ...(hasBody ? { body: JSON.stringify(payload) } : {}),
        },
      );
      if (!res.ok) return res;
      return ok(asTx(res.value.json));
    },
  };
}
