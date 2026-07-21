import type {
  EgovAiCreditsResult,
  EgovAiDocumentExtractorInput,
  EgovAiDocumentExtractorResult,
  EgovAiGenerateInput,
  EgovAiGenerateResult,
  EgovAiPort,
  EgovAiTokenResult,
  EgovAiTranslatorInput,
  EgovAiTranslatorResult,
} from "@egov/application";
import { appError, err, ok, type Result } from "@egov/shared";
import {
  DEFAULT_BASE_URLS,
  envOrDefault,
  platformFetch,
  requireEnvAny,
  type PlatformEnv,
} from "./http.js";

/**
 * Official eGov AI paths (docs/platform-apis.md §4).
 * Base: https://egov-ai-core-ws.oueg.info
 */
const PATHS = {
  token: "/api/v1/egov/integration/token",
  ai_assistant: "/api/v1/egov/integration/ai_assistant/generate",
  speech_maker: "/api/v1/egov/integration/speech_maker/generate",
  tourism: "/api/v1/egov/integration/tourism/generate",
  laws: "/api/v1/egov/integration/laws_and_regulations/generate",
  translator: "/api/v1/egov/integration/translator/generate",
  document_extractor: "/api/v1/egov/integration/document_extractor/generate",
  credits: "/api/v1/egov/integration/credits",
} as const;

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function toBlobPart(bytes: Uint8Array | ArrayBuffer | Blob): BlobPart {
  if (bytes instanceof Blob) return bytes;
  if (bytes instanceof ArrayBuffer) return bytes;
  // Copy into a plain ArrayBuffer so BlobPart typing is happy under DOM lib.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function createEgovAiAdapter(env: PlatformEnv): EgovAiPort {
  const base = () =>
    envOrDefault(env, "EGOV_AI_BASE_URL", DEFAULT_BASE_URLS.egovAi);

  async function mintToken(): Promise<Result<EgovAiTokenResult>> {
    const accessCode = requireEnvAny(env, [
      "EGOV_AI_ACCESS_CODE",
      "EGOV_AI_API_KEY",
    ]);
    if (!accessCode.ok) return accessCode;

    const res = await platformFetch(`${base()}${PATHS.token}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ access_code: accessCode.value }),
    });
    if (!res.ok) return res;

    const accessToken = String(
      res.value.json.access_token ?? res.value.json.accessToken ?? "",
    );
    if (!accessToken) {
      return err(
        appError(
          "VALIDATION",
          "eGov AI token response missing access_token",
          res.value.json,
        ),
      );
    }

    const expiresInSeconds = asNumber(res.value.json.expires_in_seconds);
    const creditsTotal = asNumber(res.value.json.credits_total);
    const creditsRemaining = asNumber(res.value.json.credits_remaining);

    return ok({
      accessToken,
      token: accessToken,
      raw: res.value.json,
      ...(expiresInSeconds !== undefined ? { expiresInSeconds } : {}),
      ...(creditsTotal !== undefined ? { creditsTotal } : {}),
      ...(creditsRemaining !== undefined ? { creditsRemaining } : {}),
    });
  }

  async function bearer(token?: string): Promise<Result<string>> {
    if (token?.trim()) return ok(token.trim());
    const minted = await mintToken();
    if (!minted.ok) return minted;
    return ok(minted.value.accessToken);
  }

  async function postGenerate(
    path: string,
    input: EgovAiGenerateInput,
  ): Promise<Result<EgovAiGenerateResult>> {
    const auth = await bearer(input.token);
    if (!auth.ok) return auth;

    const res = await platformFetch(`${base()}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${auth.value}`,
      },
      body: JSON.stringify({
        prompt: input.prompt,
        category: input.category,
      }),
    });
    if (!res.ok) return res;

    return ok({
      data: String(res.value.json.data ?? ""),
      sessionId: String(res.value.json.session_id ?? ""),
      raw: res.value.json,
    });
  }

  return {
    token: mintToken,

    aiAssistant(input) {
      return postGenerate(PATHS.ai_assistant, input);
    },
    speechMaker(input) {
      return postGenerate(PATHS.speech_maker, input);
    },
    tourism(input) {
      return postGenerate(PATHS.tourism, input);
    },
    laws(input) {
      return postGenerate(PATHS.laws, input);
    },

    async translator(
      input: EgovAiTranslatorInput,
    ): Promise<Result<EgovAiTranslatorResult>> {
      const auth = await bearer(input.token);
      if (!auth.ok) return auth;

      const res = await platformFetch(`${base()}${PATHS.translator}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization: `Bearer ${auth.value}`,
        },
        body: JSON.stringify({
          prompt: input.prompt,
          source_lang: input.sourceLang,
          target_lang: input.targetLang,
        }),
      });
      if (!res.ok) return res;

      const fromRaw = res.value.json.translate_from;
      const translateFrom =
        fromRaw &&
        typeof fromRaw === "object" &&
        !Array.isArray(fromRaw) &&
        typeof (fromRaw as { code?: unknown }).code === "string" &&
        typeof (fromRaw as { label?: unknown }).label === "string"
          ? {
              code: (fromRaw as { code: string }).code,
              label: (fromRaw as { label: string }).label,
            }
          : undefined;

      const transliteratedPrompt = asString(
        res.value.json.transliterated_prompt,
      );

      return ok({
        originalPrompt: String(
          res.value.json.original_prompt ?? input.prompt,
        ),
        sourceLang: String(res.value.json.source_lang ?? input.sourceLang),
        targetLang: String(res.value.json.target_lang ?? input.targetLang),
        translatedPrompt: String(res.value.json.translated_prompt ?? ""),
        raw: res.value.json,
        ...(translateFrom !== undefined ? { translateFrom } : {}),
        ...(transliteratedPrompt !== undefined
          ? { transliteratedPrompt }
          : {}),
      });
    },

    async documentExtractor(
      input: EgovAiDocumentExtractorInput,
    ): Promise<Result<EgovAiDocumentExtractorResult>> {
      const auth = await bearer(input.token);
      if (!auth.ok) return auth;

      const form = new FormData();
      const blob = new Blob([toBlobPart(input.file.bytes)], {
        type: input.file.contentType ?? "application/octet-stream",
      });
      form.append("file", blob, input.file.filename);

      const res = await platformFetch(`${base()}${PATHS.document_extractor}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${auth.value}`,
          // Do not set content-type — fetch sets multipart boundary.
        },
        body: form,
      });
      if (!res.ok) return res;

      return ok({
        data: String(res.value.json.data ?? ""),
        raw: res.value.json,
      });
    },

    async credits(token?: string): Promise<Result<EgovAiCreditsResult>> {
      const auth = await bearer(token);
      if (!auth.ok) return auth;

      const res = await platformFetch(`${base()}${PATHS.credits}`, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${auth.value}`,
        },
      });
      if (!res.ok) return res;

      const expiresAt = asString(res.value.json.expires_at);
      return ok({
        creditsTotal: asNumber(res.value.json.credits_total) ?? 0,
        creditsUsed: asNumber(res.value.json.credits_used) ?? 0,
        creditsRemaining: asNumber(res.value.json.credits_remaining) ?? 0,
        raw: res.value.json,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      });
    },
  };
}
