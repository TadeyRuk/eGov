import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EgovAiPort } from "../ports/platform.js";
import { appError, err, ok } from "@egov/shared";
import { orchestrateEgovAi } from "./egov-ai-orchestrator.js";

function fakeAi(plan: string, translatorFails = false): EgovAiPort {
  return {
    token: async () => ok({ accessToken: "test-token", token: "test-token", raw: {} }),
    aiAssistant: async () => ok({ data: plan, sessionId: "assistant-session", raw: {} }),
    speechMaker: async (input) => ok({ data: `audio:${input.prompt}`, sessionId: "speech-session", raw: {} }),
    tourism: async () => err(appError("INTERNAL", "unused")),
    laws: async () => ok({ data: "Legal context with citation", sessionId: "laws-session", raw: {} }),
    translator: async (input) => translatorFails
      ? err(appError("UNAVAILABLE", "translator unavailable"))
      : ok({
          originalPrompt: input.prompt,
          sourceLang: input.sourceLang,
          targetLang: input.targetLang,
          translatedPrompt: `salin:${input.prompt}`,
          raw: {},
        }),
    documentExtractor: async () => err(appError("INTERNAL", "unused")),
    credits: async () => ok({ creditsTotal: 1, creditsUsed: 0, creditsRemaining: 1, raw: {} }),
  };
}

describe("orchestrateEgovAi", () => {
  it("lets the assistant select translator and speech in auto mode", async () => {
    const result = await orchestrateEgovAi(
      { egovAi: fakeAi('{"answer":"Hello","useTranslator":true,"targetLang":"fil","useSpeech":true,"reason":"accessibility"}') },
      { prompt: "Explain this in Filipino and read it aloud" },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.answer, "salin:Hello");
    assert.equal(result.value.speechOutput, "audio:salin:Hello");
    assert.deepEqual(result.value.metrics.tools.map((metric) => metric.status), ["ok", "ok", "skipped", "ok", "ok"]);
  });

  it("off policy prevents optional tool calls", async () => {
    const result = await orchestrateEgovAi(
      { egovAi: fakeAi('{"answer":"Hello","useTranslator":true,"useSpeech":true,"reason":"requested"}') },
      { prompt: "Hello", translator: "off", speech: "off" },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.answer, "Hello");
    assert.deepEqual(result.value.metrics.tools.map((metric) => metric.status), ["ok", "ok", "skipped", "skipped", "skipped"]);
  });

  it("on policy forces optional tools even when the assistant declines", async () => {
    const result = await orchestrateEgovAi(
      { egovAi: fakeAi('{"answer":"Hello","useTranslator":false,"useSpeech":false,"reason":"not needed"}') },
      { prompt: "Hello", translator: "on", speech: "on", targetLang: "fil" },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.decision.translator, true);
    assert.equal(result.value.decision.speech, true);
  });

  it("returns a degraded main answer when an optional tool fails", async () => {
    const result = await orchestrateEgovAi(
      { egovAi: fakeAi('{"answer":"Hello","useTranslator":true,"useSpeech":false,"reason":"requested"}', true) },
      { prompt: "Translate this" },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.status, "degraded");
    assert.equal(result.value.answer, "Hello");
    assert.equal(result.value.metrics.tools.find((metric) => metric.tool === "translator")?.status, "failed");
  });

  it("lets the assistant call Laws for legal context", async () => {
    const result = await orchestrateEgovAi(
      { egovAi: fakeAi('{"answer":"Review this entry","useLaws":true,"useTranslator":false,"useSpeech":false,"reason":"legal review"}') },
      { prompt: "Interpret this public ledger under applicable rules" },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.decision.laws, true);
    assert.equal(result.value.legalAnalysis, "Legal context with citation");
    assert.match(result.value.answer, /Legal and regulatory context/);
  });
});
