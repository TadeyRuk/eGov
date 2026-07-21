import type { EgovAiPort } from "../ports/platform.js";
import { appError, type AppError } from "@egov/shared";

export type NewsEvidence = {
  readonly source: string;
  readonly title: string;
  readonly url: string;
  readonly publishedAt: string;
  readonly snippet: string;
  readonly contentDigest: string;
};

export type NewsRetriever = {
  search(input: { readonly query: string; readonly limit: number }): Promise<readonly NewsEvidence[]>;
};

export type PublicInterestSignal = {
  readonly sourceUrl: string;
  readonly sourceTitle: string;
  readonly projectReference: string | null;
  readonly agencyCode: string | null;
  readonly allegationCategory: string;
  readonly claimedAmountCentavos: string | null;
  readonly claimSummary: string;
  readonly confidence: number;
  readonly status: "UNVERIFIED_MEDIA_SIGNAL";
};

export type PublicInterestNewsRagOutcome =
  | { readonly ok: true; readonly value: { readonly signals: readonly PublicInterestSignal[]; readonly legalContext: string; readonly evidence: readonly NewsEvidence[]; readonly metrics: { readonly retrievalMs: number; readonly normalizationMs: number; readonly lawsMs: number; readonly totalMs: number } } }
  | { readonly ok: false; readonly error: AppError };

function jsonObject(raw: string): Record<string, unknown> | undefined {
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

export async function runPublicInterestNewsRag(
  deps: { readonly retriever: NewsRetriever; readonly egovAi: EgovAiPort },
  input: { readonly query: string; readonly projectContext?: string; readonly limit?: number },
): Promise<PublicInterestNewsRagOutcome> {
  const started = performance.now();
  if (!input.query.trim()) return { ok: false, error: appError("VALIDATION", "query is required") };
  const retrievalStarted = performance.now();
  const evidence = await deps.retriever.search({ query: input.query, limit: Math.min(Math.max(input.limit ?? 8, 1), 20) });
  const retrievalMs = Number((performance.now() - retrievalStarted).toFixed(2));
  if (evidence.length === 0) return { ok: true, value: { signals: [], legalContext: "", evidence: [], metrics: { retrievalMs, normalizationMs: 0, lawsMs: 0, totalMs: Number((performance.now() - started).toFixed(2)) } } };
  const token = await deps.egovAi.token();
  if (!token.ok) return token;

  const normalizationStarted = performance.now();
  const normalized = await deps.egovAi.aiAssistant({
    token: token.value.accessToken,
    category: "PH",
    prompt: [
      "Normalize retrieved public-interest news into ONLY this JSON: {\"signals\":[{\"sourceUrl\":\"\",\"sourceTitle\":\"\",\"projectReference\":null,\"agencyCode\":null,\"allegationCategory\":\"\",\"claimedAmountCentavos\":null,\"claimSummary\":\"\",\"confidence\":0}]}",
      "Use only supplied evidence. A news allegation is never proof of corruption or a legal finding.",
      "Do not infer identities, guilt, amounts, project links, or agency codes that are absent. Keep summaries factual and attribution-aware.",
      `Known project/ledger context: ${input.projectContext ?? "none supplied"}`,
      `Evidence metadata and short snippets: ${JSON.stringify(evidence)}`,
    ].join("\n"),
  });
  const normalizationMs = Number((performance.now() - normalizationStarted).toFixed(2));
  if (!normalized.ok) return normalized;
  const parsed = jsonObject(normalized.value.data);
  if (!parsed || !Array.isArray(parsed.signals)) return { ok: false, error: appError("VALIDATION", "AI returned an invalid news normalization schema") };
  const evidenceUrls = new Set(evidence.map((item) => item.url));
  const signals: PublicInterestSignal[] = parsed.signals.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const value = item as Record<string, unknown>;
    if (typeof value.sourceUrl !== "string" || !evidenceUrls.has(value.sourceUrl) || typeof value.sourceTitle !== "string" || typeof value.allegationCategory !== "string" || typeof value.claimSummary !== "string") return [];
    return [{
      sourceUrl: value.sourceUrl,
      sourceTitle: value.sourceTitle,
      projectReference: typeof value.projectReference === "string" ? value.projectReference : null,
      agencyCode: typeof value.agencyCode === "string" ? value.agencyCode : null,
      allegationCategory: value.allegationCategory,
      claimedAmountCentavos: typeof value.claimedAmountCentavos === "string" && /^\d+$/.test(value.claimedAmountCentavos) ? value.claimedAmountCentavos : null,
      claimSummary: value.claimSummary,
      confidence: typeof value.confidence === "number" ? Math.min(Math.max(value.confidence, 0), 1) : 0,
      status: "UNVERIFIED_MEDIA_SIGNAL" as const,
    }];
  });

  const lawsStarted = performance.now();
  const laws = await deps.egovAi.laws({
    token: token.value.accessToken,
    category: "PH",
    prompt: [
      "Identify potentially relevant Philippine audit, procurement, anti-graft, and accountability rules for human review of these unverified media signals.",
      "Cite official law/regulation title, section, and URL only when verifiable. Do not say a law was violated and do not determine guilt.",
      JSON.stringify(signals),
    ].join("\n"),
  });
  const lawsMs = Number((performance.now() - lawsStarted).toFixed(2));
  return {
    ok: true,
    value: {
      signals,
      legalContext: laws.ok ? laws.value.data : "Legal-context tool unavailable; human review is required.",
      evidence,
      metrics: { retrievalMs, normalizationMs, lawsMs, totalMs: Number((performance.now() - started).toFixed(2)) },
    },
  };
}
