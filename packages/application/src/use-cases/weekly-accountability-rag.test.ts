import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ok } from "@egov/shared";
import type { EgovAiPort } from "../ports/platform.js";
import type { NewsEvidence } from "./public-interest-news-rag.js";
import { matchedAccountabilityKeywords, runWeeklyAccountabilityRag } from "./weekly-accountability-rag.js";

const relevant: NewsEvidence = {
  source: "Sample News",
  title: "Audit flags alleged ghost project and overpricing",
  url: "https://news.example/relevant",
  publishedAt: "2026-07-20T02:00:00.000Z",
  snippet: "The report described a possible ghost project involving public funds.",
  contentDigest: "0xrelevant",
};
const unrelated: NewsEvidence = {
  source: "Sample News",
  title: "Weather bulletin",
  url: "https://news.example/weather",
  publishedAt: "2026-07-20T03:00:00.000Z",
  snippet: "Rain is expected.",
  contentDigest: "0xweather",
};
const ai: EgovAiPort = {
  token: async () => ok({ accessToken: "token", token: "token", raw: {} }),
  aiAssistant: async () => ok({ data: JSON.stringify({ signals: [{ sourceUrl: relevant.url, sourceTitle: relevant.title, projectReference: null, agencyCode: null, allegationCategory: "invented-category", claimedAmountCentavos: null, claimSummary: "The outlet reported an alleged ghost project.", confidence: 0.7 }] }), sessionId: "s", raw: {} }),
  laws: async () => ok({ data: "Human legal review required.", sessionId: "l", raw: {} }),
  speechMaker: async () => ok({ data: "", sessionId: "", raw: {} }),
  tourism: async () => ok({ data: "", sessionId: "", raw: {} }),
  translator: async () => ok({ originalPrompt: "", sourceLang: "en", targetLang: "fil", translatedPrompt: "", raw: {} }),
  documentExtractor: async () => ok({ data: "", raw: {} }),
  credits: async () => ok({ creditsTotal: 1, creditsUsed: 0, creditsRemaining: 1, raw: {} }),
};

describe("runWeeklyAccountabilityRag", () => {
  it("filters by explicit accountability keywords and creates review-gated drafts", async () => {
    const result = await runWeeklyAccountabilityRag(
      { retriever: { search: async () => [relevant, unrelated, relevant] }, egovAi: ai },
      { runId: "weekly-2026-07-22", generatedAt: "2026-07-22T00:00:00.000Z", periodStart: "2026-07-15T00:00:00.000Z", periodEnd: "2026-07-22T00:00:00.000Z", keywords: ["ghost project", "overpricing"] },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.evidence.length, 1);
    assert.equal(result.value.signals[0]?.allegationCategory, "GHOST_PROJECT");
    assert.deepEqual(result.value.signals[0]?.matchedKeywords, ["ghost project", "overpricing"]);
    assert.equal(result.value.eReportDrafts[0]?.status, "HUMAN_REVIEW_REQUIRED");
  });

  it("does not call AI when no candidate matches the keyword policy", async () => {
    let aiCalled = false;
    const result = await runWeeklyAccountabilityRag(
      { retriever: { search: async () => [unrelated] }, egovAi: { ...ai, token: async () => { aiCalled = true; return ai.token(); } } },
      { runId: "weekly-empty", generatedAt: "2026-07-22T00:00:00.000Z", periodStart: "2026-07-15T00:00:00.000Z", periodEnd: "2026-07-22T00:00:00.000Z", keywords: ["graft"] },
    );
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.signals.length, 0);
    assert.equal(aiCalled, false);
  });

  it("uses word boundaries so Filipino substrings do not become false matches", () => {
    assert.deepEqual(matchedAccountabilityKeywords({ ...unrelated, snippet: "Kalagayan ng panahon ngayong linggo." }, ["lagay"]), []);
  });
});
