import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EgovAiPort } from "../ports/platform.js";
import { ok } from "@egov/shared";
import { normalizeGovernmentDocument } from "./government-document-ocr.js";

const ai: EgovAiPort = {
  token: async () => ok({ accessToken: "temporary", token: "temporary", raw: {} }),
  documentExtractor: async () => ok({ data: "TIN 000-000; tax year 2026", raw: {} }),
  aiAssistant: async () => ok({ data: JSON.stringify({ schemaVersion: "1.0", documentType: "TAX_RETURN", issuerAgencyCode: "BIR-MOCK", fiscalYear: 2026, publicTitle: "must be removed", publicSourceUrl: "https://example.test/private", fields: { taxYear: 2026 }, warnings: [] }), sessionId: "s", raw: {} }),
  speechMaker: async () => ok({ data: "", sessionId: "", raw: {} }),
  tourism: async () => ok({ data: "", sessionId: "", raw: {} }),
  laws: async () => ok({ data: "", sessionId: "", raw: {} }),
  translator: async () => ok({ originalPrompt: "", sourceLang: "en", targetLang: "fil", translatedPrompt: "", raw: {} }),
  credits: async () => ok({ creditsTotal: 1, creditsUsed: 0, creditsRemaining: 1, raw: {} }),
};

describe("normalizeGovernmentDocument", () => {
  it("extracts and normalizes a private tax document without public metadata", async () => {
    const result = await normalizeGovernmentDocument(ai, { file: { bytes: new Uint8Array([1]), filename: "tax.pdf" }, visibility: "PRIVATE_INDIVIDUAL" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.normalized.documentType, "TAX_RETURN");
    assert.equal(result.value.normalized.publicTitle, "");
    assert.equal(result.value.normalized.publicSourceUrl, "");
  });
});
