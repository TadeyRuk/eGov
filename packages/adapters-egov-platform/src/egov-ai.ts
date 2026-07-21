import type {
  EgovAiPort,
  EgovAiRequest,
  EgovAiResponse,
  EgovAiTokenResult,
  PlatformJson,
} from "@egov/application";
import { appError, err, ok, type Result } from "@egov/shared";
import {
  DEFAULT_BASE_URLS,
  envOrDefault,
  platformFetch,
  requireEnv,
  type PlatformEnv,
} from "./http.js";

const API_PREFIX = "/api/v1/egov/integration";

const PATHS = {
  token: `${API_PREFIX}/token`,
  ai_assistant: `${API_PREFIX}/ai_assistant/generate`,
  speech_maker: `${API_PREFIX}/speech_maker/generate`,
  tourism: `${API_PREFIX}/tourism/generate`,
  laws: `${API_PREFIX}/laws_and_regulations/generate`,
  translator: `${API_PREFIX}/translator/generate`,
  document_extractor: `${API_PREFIX}/document_extractor/generate`,
  credits: `${API_PREFIX}/credits`,
} as const;

export function createEgovAiAdapter(env: PlatformEnv): EgovAiPort {
  const base = () =>
    envOrDefault(env, "EGOV_AI_BASE_URL", DEFAULT_BASE_URLS.egovAi);

  async function postGeneration(
    path: string,
    input: EgovAiRequest,
  ): Promise<Result<EgovAiResponse>> {
    if (!input.token?.trim()) {
      return err(appError("VALIDATION", "eGov AI generation requires a bearer token"));
    }
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${input.token}`,
    };
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
      const accessCode = requireEnv(env, "EGOV_AI_ACCESS_CODE");
      if (!accessCode.ok) return accessCode;
      const res = await platformFetch(`${base()}${PATHS.token}`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...(credentials ?? {}), access_code: accessCode.value }),
      });
      if (!res.ok) return res;
      const token = String(
        res.value.json.token ?? res.value.json.access_token ?? "",
      );
      if (!token) {
        return err(appError("VALIDATION", "eGov AI token response did not include an access token"));
      }
      return ok({ token, raw: res.value.json });
    },
    aiAssistant(input) {
      return postGeneration(PATHS.ai_assistant, input);
    },
    speechMaker(input) {
      return postGeneration(PATHS.speech_maker, input);
    },
    tourism(input) {
      return postGeneration(PATHS.tourism, input);
    },
    laws(input) {
      return postGeneration(PATHS.laws, input);
    },
    translator(input) {
      return postGeneration(PATHS.translator, input);
    },
    documentExtractor(input) {
      return postGeneration(PATHS.document_extractor, input);
    },
    async credits(input) {
      if (!input.token?.trim()) {
        return err(appError("VALIDATION", "eGov AI credits requires a bearer token"));
      }
      const res = await platformFetch(`${base()}${PATHS.credits}`, {
        method: "GET",
        headers: { accept: "application/json", authorization: `Bearer ${input.token}` },
      });
      if (!res.ok) return res;
      return ok({ raw: res.value.json });
    },
  };
}
