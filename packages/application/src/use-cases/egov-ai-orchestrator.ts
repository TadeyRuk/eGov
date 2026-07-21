import type { EgovAiPort } from "../ports/platform.js";
import { appError, type AppError } from "@egov/shared";

export type AiToolPolicy = "auto" | "on" | "off";
export type AiToolName = "token" | "assistant" | "laws" | "translator" | "speech";

export type AiToolMetric = {
  readonly tool: AiToolName;
  readonly status: "ok" | "failed" | "skipped";
  readonly durationMs: number;
  readonly message?: string;
};

export type EgovAiOrchestrationInput = {
  readonly prompt: string;
  readonly category?: string;
  readonly sourceLang?: string;
  readonly targetLang?: string;
  readonly translator?: AiToolPolicy;
  readonly speech?: AiToolPolicy;
  readonly laws?: AiToolPolicy;
  readonly correlationId?: string;
};

export type EgovAiToolDecision = {
  readonly translator: boolean;
  readonly speech: boolean;
  readonly laws: boolean;
  readonly sourceLang: string;
  readonly targetLang: string;
  readonly reason: string;
};

export type EgovAiOrchestrationValue = {
  readonly status: "ok" | "degraded";
  readonly answer: string;
  readonly assistantAnswer: string;
  readonly translatedAnswer?: string;
  readonly speechOutput?: string;
  readonly legalAnalysis?: string;
  readonly decision: EgovAiToolDecision;
  readonly metrics: {
    readonly totalDurationMs: number;
    readonly tools: readonly AiToolMetric[];
  };
};

export type EgovAiOrchestrationOutcome =
  | { readonly ok: true; readonly value: EgovAiOrchestrationValue }
  | {
      readonly ok: false;
      readonly error: AppError;
      readonly metrics: {
        readonly totalDurationMs: number;
        readonly tools: readonly AiToolMetric[];
      };
    };

export type EgovAiOrchestrationLog = {
  readonly event: "egov_ai_tool";
  readonly correlationId?: string;
  readonly tool: AiToolName;
  readonly status: AiToolMetric["status"];
  readonly durationMs: number;
  readonly message?: string;
};

export type OrchestrateEgovAiDeps = {
  readonly egovAi: EgovAiPort;
  readonly log?: (entry: EgovAiOrchestrationLog) => void;
  readonly now?: () => number;
};

type AssistantPlan = {
  readonly answer: string;
  readonly useTranslator: boolean;
  readonly useSpeech: boolean;
  readonly useLaws: boolean;
  readonly targetLang?: string;
  readonly reason: string;
};

function parseAssistantPlan(raw: string): AssistantPlan {
  const unfenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return {
      answer: raw.trim(),
      useTranslator: false,
      useSpeech: false,
      useLaws: false,
      reason: "Assistant returned a direct answer without a tool plan",
    };
  }

  try {
    const value = JSON.parse(unfenced.slice(start, end + 1)) as Record<string, unknown>;
    const answer = typeof value.answer === "string" ? value.answer.trim() : "";
    if (!answer) throw new Error("answer is required");
    return {
      answer,
      useTranslator: value.useTranslator === true,
      useSpeech: value.useSpeech === true,
      useLaws: value.useLaws === true,
      reason: typeof value.reason === "string" ? value.reason : "Assistant tool decision",
      ...(typeof value.targetLang === "string" && /^[a-z]{2,3}$/i.test(value.targetLang)
        ? { targetLang: value.targetLang.toLowerCase() }
        : {}),
    };
  } catch {
    return {
      answer: raw.trim(),
      useTranslator: false,
      useSpeech: false,
      useLaws: false,
      reason: "Assistant tool plan was invalid; optional tools were disabled safely",
    };
  }
}

function selected(policy: AiToolPolicy, assistantChoice: boolean): boolean {
  if (policy === "on") return true;
  if (policy === "off") return false;
  return assistantChoice;
}

function routerPrompt(input: EgovAiOrchestrationInput): string {
  return [
    "Act as the main government-service assistant and decide whether Translator or Speech Maker is useful.",
    "Return ONLY one JSON object with this schema:",
    '{"answer":"final helpful answer","useLaws":false,"useTranslator":false,"targetLang":"fil","useSpeech":false,"reason":"short reason"}',
    "Use Laws and Regulations when the request needs legal, regulatory, audit, or compliance interpretation.",
    "Use Translator when the user requests another language or it materially improves accessibility.",
    "Use Speech Maker when the user asks for audio/read-aloud or speech materially improves accessibility.",
    `Laws policy: ${input.laws ?? "auto"}. Translator policy: ${input.translator ?? "auto"}. Speech policy: ${input.speech ?? "auto"}.`,
    `Preferred target language: ${input.targetLang ?? "fil"}.`,
    `User request: ${input.prompt}`,
  ].join("\n");
}

export async function orchestrateEgovAi(
  deps: OrchestrateEgovAiDeps,
  input: EgovAiOrchestrationInput,
): Promise<EgovAiOrchestrationOutcome> {
  const now = deps.now ?? (() => performance.now());
  const startedAt = now();
  const metrics: AiToolMetric[] = [];
  const addMetric = (metric: AiToolMetric): void => {
    metrics.push(metric);
    deps.log?.({
      event: "egov_ai_tool",
      ...(input.correlationId ? { correlationId: input.correlationId } : {}),
      ...metric,
    });
  };
  const fail = (error: AppError): EgovAiOrchestrationOutcome => ({
    ok: false,
    error,
    metrics: { totalDurationMs: Number((now() - startedAt).toFixed(2)), tools: metrics },
  });

  if (!input.prompt?.trim()) {
    return fail(appError("VALIDATION", "prompt is required"));
  }

  const tokenStarted = now();
  const token = await deps.egovAi.token();
  addMetric({
    tool: "token",
    status: token.ok ? "ok" : "failed",
    durationMs: Number((now() - tokenStarted).toFixed(2)),
    ...(!token.ok ? { message: token.error.message } : {}),
  });
  if (!token.ok) return fail(token.error);

  const assistantStarted = now();
  const assistant = await deps.egovAi.aiAssistant({
    token: token.value.accessToken,
    prompt: routerPrompt(input),
    category: input.category?.trim() || "PH",
  });
  addMetric({
    tool: "assistant",
    status: assistant.ok ? "ok" : "failed",
    durationMs: Number((now() - assistantStarted).toFixed(2)),
    ...(!assistant.ok ? { message: assistant.error.message } : {}),
  });
  if (!assistant.ok) return fail(assistant.error);

  const plan = parseAssistantPlan(assistant.value.data);
  const translatorPolicy = input.translator ?? "auto";
  const speechPolicy = input.speech ?? "auto";
  const lawsPolicy = input.laws ?? "auto";
  const useLaws = selected(lawsPolicy, plan.useLaws);
  const useTranslator = selected(translatorPolicy, plan.useTranslator);
  const useSpeech = selected(speechPolicy, plan.useSpeech);
  const sourceLang = input.sourceLang?.trim().toLowerCase() || "en";
  const targetLang = input.targetLang?.trim().toLowerCase() || plan.targetLang || "fil";
  let answer = plan.answer;
  let translatedAnswer: string | undefined;
  let speechOutput: string | undefined;
  let legalAnalysis: string | undefined;
  let degraded = false;

  if (useLaws) {
    const lawsStarted = now();
    const laws = await deps.egovAi.laws({
      token: token.value.accessToken,
      prompt: [
        "Provide legal/regulatory context for the following government-service answer.",
        "Cite the law/regulation title, section, and source URL when the tool can verify them.",
        "If a citation cannot be verified, explicitly say that no verified legal citation is available.",
        "Treat analytics anomalies as review signals, not findings of wrongdoing.",
        plan.answer,
      ].join("\n"),
      category: input.category?.trim() || "PH",
    });
    addMetric({
      tool: "laws",
      status: laws.ok ? "ok" : "failed",
      durationMs: Number((now() - lawsStarted).toFixed(2)),
      ...(!laws.ok ? { message: laws.error.message } : {}),
    });
    if (laws.ok) {
      legalAnalysis = laws.value.data;
      if (legalAnalysis) answer = `${answer}\n\nLegal and regulatory context:\n${legalAnalysis}`;
    } else {
      degraded = true;
    }
  } else {
    addMetric({ tool: "laws", status: "skipped", durationMs: 0 });
  }

  if (useTranslator) {
    const translatorStarted = now();
    const translated = await deps.egovAi.translator({
      token: token.value.accessToken,
      prompt: answer,
      sourceLang,
      targetLang,
    });
    addMetric({
      tool: "translator",
      status: translated.ok ? "ok" : "failed",
      durationMs: Number((now() - translatorStarted).toFixed(2)),
      ...(!translated.ok ? { message: translated.error.message } : {}),
    });
    if (translated.ok) {
      translatedAnswer = translated.value.translatedPrompt;
      if (translatedAnswer) answer = translatedAnswer;
    } else {
      degraded = true;
    }
  } else {
    addMetric({ tool: "translator", status: "skipped", durationMs: 0 });
  }

  if (useSpeech) {
    const speechStarted = now();
    const speech = await deps.egovAi.speechMaker({
      token: token.value.accessToken,
      prompt: answer,
      category: input.category?.trim() || "PH",
    });
    addMetric({
      tool: "speech",
      status: speech.ok ? "ok" : "failed",
      durationMs: Number((now() - speechStarted).toFixed(2)),
      ...(!speech.ok ? { message: speech.error.message } : {}),
    });
    if (speech.ok) speechOutput = speech.value.data;
    else degraded = true;
  } else {
    addMetric({ tool: "speech", status: "skipped", durationMs: 0 });
  }

  return {
    ok: true,
    value: {
      status: degraded ? "degraded" : "ok",
      answer,
      assistantAnswer: plan.answer,
      ...(translatedAnswer !== undefined ? { translatedAnswer } : {}),
      ...(speechOutput !== undefined ? { speechOutput } : {}),
      ...(legalAnalysis !== undefined ? { legalAnalysis } : {}),
      decision: {
        translator: useTranslator,
        speech: useSpeech,
        laws: useLaws,
        sourceLang,
        targetLang,
        reason: plan.reason,
      },
      metrics: {
        totalDurationMs: Number((now() - startedAt).toFixed(2)),
        tools: metrics,
      },
    },
  };
}
