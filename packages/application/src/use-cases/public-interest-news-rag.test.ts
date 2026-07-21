import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EgovAiPort } from "../ports/platform.js";
import { ok } from "@egov/shared";
import { runPublicInterestNewsRag } from "./public-interest-news-rag.js";

const evidence = { source: "Example News", title: "Audit review reported", url: "https://news.example/item", publishedAt: "2026-07-22", snippet: "An audit review was reported.", contentDigest: "abc" };
const ai: EgovAiPort = {
  token: async () => ok({ accessToken: "temporary", token: "temporary", raw: {} }),
  aiAssistant: async () => ok({ data: JSON.stringify({ signals: [{ sourceUrl: evidence.url, sourceTitle: evidence.title, projectReference: null, agencyCode: null, allegationCategory: "AUDIT_REVIEW", claimedAmountCentavos: null, claimSummary: "The outlet reported an audit review.", confidence: 0.7 }] }), sessionId: "s", raw: {} }),
  laws: async () => ok({ data: "Potentially relevant rules; human review required.", sessionId: "l", raw: {} }),
  speechMaker: async () => ok({ data: "", sessionId: "", raw: {} }),
  tourism: async () => ok({ data: "", sessionId: "", raw: {} }),
  translator: async () => ok({ originalPrompt: "", sourceLang: "en", targetLang: "fil", translatedPrompt: "", raw: {} }),
  documentExtractor: async () => ok({ data: "", raw: {} }),
  credits: async () => ok({ creditsTotal: 1, creditsUsed: 0, creditsRemaining: 1, raw: {} }),
};

describe("runPublicInterestNewsRag", () => {
  it("keeps retrieved allegations as unverified review signals", async () => {
    const result = await runPublicInterestNewsRag({ retriever: { search: async () => [evidence] }, egovAi: ai }, { query: "audit" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.signals[0]?.status, "UNVERIFIED_MEDIA_SIGNAL");
    assert.equal(result.value.signals[0]?.sourceUrl, evidence.url);
  });

  it("drops AI citations that were not in retrieved evidence", async () => {
    const altered = { ...ai, aiAssistant: async () => ok({ data: JSON.stringify({ signals: [{ sourceUrl: "https://invented.example", sourceTitle: "Invented", allegationCategory: "GRAFT", claimSummary: "Invented", confidence: 1 }] }), sessionId: "s", raw: {} }) } satisfies EgovAiPort;
    const result = await runPublicInterestNewsRag({ retriever: { search: async () => [evidence] }, egovAi: altered }, { query: "audit" });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.signals.length, 0);
  });
});
