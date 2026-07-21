import type {
  EgovAiPort,
  EgovAiRequest,
  EgovAiResponse,
  EgovAiTokenResult,
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

/**
 * Path map is intentionally thin — exact paths may be refined against live OpenAPI
 * from the dashboard without changing the port surface.
 */
const PATHS = {
  token: "/token",
  ai_assistant: "/ai_assistant",
  speech_maker: "/speech_maker",
  tourism: "/tourism",
  laws: "/laws",
  translator: "/translator",
  document_extractor: "/document_extractor",
  credits: "/credits",
} as const;

export function createEgovAiAdapter(env: PlatformEnv): EgovAiPort {
  const base = () =>
    envOrDefault(env, "EGOV_AI_BASE_URL", DEFAULT_BASE_URLS.egovAi);

  async function post(
    path: string,
    input: EgovAiRequest,
  ): Promise<Result<EgovAiResponse>> {
    const apiKey = requireEnvAny(env, [
      "EGOV_AI_ACCESS_CODE",
      "EGOV_AI_API_KEY",
    ]);
    if (!apiKey.ok) return apiKey;
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      "X-API-Key": apiKey.value,
    };
    if (input.token) {
      headers.authorization = `Bearer ${input.token}`;
    }
    const res = await platformFetch(`${base()}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(input.payload),
    });
    if (!res.ok) return res;
    return ok({ raw: res.value.json });
  }

  return {
    async token(credentials?: PlatformJson): Promise<Result<EgovAiTokenResult>> {
      const result = await post(PATHS.token, { payload: credentials ?? {} });
      if (!result.ok) return result;
      const token = String(
        result.value.raw.token ?? result.value.raw.access_token ?? "",
      );
      return ok({ token, raw: result.value.raw });
    },
    aiAssistant(input) {
      return post(PATHS.ai_assistant, input);
    },
    speechMaker(input) {
      return post(PATHS.speech_maker, input);
    },
    tourism(input) {
      return post(PATHS.tourism, input);
    },
    laws(input) {
      return post(PATHS.laws, input);
    },
    translator(input) {
      return post(PATHS.translator, input);
    },
    documentExtractor(input) {
      return post(PATHS.document_extractor, input);
    },
    credits(input) {
      return post(PATHS.credits, input);
    },
  };
}
