import { appError, ok, type Result } from "@egov/shared";
import type { EgovAiPort } from "../ports/platform.js";
import {
  runPublicInterestNewsRag,
  type NewsEvidence,
  type NewsRetriever,
  type PublicInterestSignal,
} from "./public-interest-news-rag.js";

export const ACCOUNTABILITY_KEYWORD_GROUPS = {
  GRAFT: ["graft", "katiwalian"],
  CORRUPTION: ["corruption", "corrupt", "korapsyon"],
  BRIBERY: ["bribery", "bribe", "kickback", "suhol", "lagay"],
  PLUNDER: ["plunder", "pandarambong"],
  MISUSE_OF_PUBLIC_FUNDS: [
    "misuse of public funds",
    "misappropriation",
    "embezzlement",
    "paglustay ng pondo",
    "pagnanakaw sa bayan",
    "nakaw sa kaban ng bayan",
    "pondong bayan",
  ],
  PROCUREMENT_ANOMALY: [
    "procurement fraud",
    "bid rigging",
    "anomalous contract",
    "irregular procurement",
    "kuwestiyonableng kontrata",
  ],
  GHOST_PROJECT: ["ghost project", "ghost delivery", "pekeng proyekto"],
  OVERPRICING: ["overpricing", "overpriced", "sobrang presyo"],
  CONFLICT_OF_INTEREST: ["conflict of interest", "nepotism", "pabor sa kamag-anak"],
  AUDIT_REVIEW: ["audit finding", "audit observation", "audit anomaly", "coa finding"],
} as const;

export type AccountabilityCategory = keyof typeof ACCOUNTABILITY_KEYWORD_GROUPS;
export const ACCOUNTABILITY_RAG_KEYWORDS = Object.values(ACCOUNTABILITY_KEYWORD_GROUPS).flat();

export type WeeklyAccountabilitySignal = PublicInterestSignal & {
  readonly allegationCategory: AccountabilityCategory;
  readonly matchedKeywords: readonly string[];
};

export type WeeklyEReportDraft = {
  readonly draftId: string;
  readonly status: "HUMAN_REVIEW_REQUIRED";
  readonly reportType: "public_integrity_review";
  readonly subject: string;
  readonly summary: string;
  readonly category: AccountabilityCategory;
  readonly sourceUrls: readonly string[];
  readonly matchedKeywords: readonly string[];
};

export type WeeklyAccountabilityArtifact = {
  readonly schemaVersion: "1.0";
  readonly runId: string;
  readonly generatedAt: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly keywords: readonly string[];
  readonly evidence: readonly NewsEvidence[];
  readonly signals: readonly WeeklyAccountabilitySignal[];
  readonly eReportDrafts: readonly WeeklyEReportDraft[];
  readonly legalContext: string;
  readonly metrics: {
    readonly queries: number;
    readonly retrievedCandidates: number;
    readonly keywordMatchedEvidence: number;
    readonly retrievalMs: number;
    readonly normalizationMs: number;
    readonly lawsMs: number;
    readonly totalMs: number;
  };
};

function normalizedText(evidence: NewsEvidence): string {
  return `${evidence.title} ${evidence.snippet}`.toLocaleLowerCase("en-PH");
}

export function matchedAccountabilityKeywords(
  evidence: NewsEvidence,
  allowedKeywords: readonly string[] = ACCOUNTABILITY_RAG_KEYWORDS,
): readonly string[] {
  const text = normalizedText(evidence);
  return allowedKeywords.filter((keyword) => {
    const escaped = keyword
      .toLocaleLowerCase("en-PH")
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(text);
  });
}

function categoryForKeywords(keywords: readonly string[]): AccountabilityCategory {
  const normalized = new Set(keywords.map((keyword) => keyword.toLocaleLowerCase("en-PH")));
  for (const [category, terms] of Object.entries(ACCOUNTABILITY_KEYWORD_GROUPS) as [AccountabilityCategory, readonly string[]][]) {
    if (terms.some((term) => normalized.has(term.toLocaleLowerCase("en-PH")))) return category;
  }
  return "AUDIT_REVIEW";
}

function inPeriod(evidence: NewsEvidence, start: number, end: number): boolean {
  const published = Date.parse(evidence.publishedAt);
  return Number.isFinite(published) && published >= start && published <= end;
}

function draftId(signal: WeeklyAccountabilitySignal): string {
  return `draft-${signal.sourceUrl}-${signal.allegationCategory}`;
}

export async function runWeeklyAccountabilityRag(
  deps: { readonly retriever: NewsRetriever; readonly egovAi: EgovAiPort },
  input: {
    readonly runId: string;
    readonly generatedAt: string;
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly keywords?: readonly string[];
    readonly perKeywordLimit?: number;
  },
): Promise<Result<WeeklyAccountabilityArtifact>> {
  const start = Date.parse(input.periodStart);
  const end = Date.parse(input.periodEnd);
  const generated = Date.parse(input.generatedAt);
  const keywords = [...new Set((input.keywords ?? ACCOUNTABILITY_RAG_KEYWORDS).map((item) => item.trim().toLocaleLowerCase("en-PH")).filter(Boolean))];
  if (!input.runId.trim() || !Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(generated) || start > end || keywords.length === 0) {
    return { ok: false, error: appError("VALIDATION", "weekly RAG requires runId, valid period/generated timestamps, and keywords") };
  }

  const retrievalStarted = performance.now();
  const candidates: NewsEvidence[] = [];
  for (const keyword of keywords) {
    const found = await deps.retriever.search({ query: keyword, limit: Math.min(Math.max(input.perKeywordLimit ?? 10, 1), 20) });
    candidates.push(...found);
  }
  const retrievalMs = Number((performance.now() - retrievalStarted).toFixed(2));
  const byKey = new Map<string, NewsEvidence>();
  for (const evidence of candidates) {
    if (!inPeriod(evidence, start, end)) continue;
    if (matchedAccountabilityKeywords(evidence, keywords).length === 0) continue;
    byKey.set(`${evidence.url}|${evidence.contentDigest}`, evidence);
  }
  const scopedEvidence = [...byKey.values()].slice(0, 100);

  if (scopedEvidence.length === 0) {
    return ok({
      schemaVersion: "1.0",
      runId: input.runId,
      generatedAt: input.generatedAt,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      keywords,
      evidence: [],
      signals: [],
      eReportDrafts: [],
      legalContext: "",
      metrics: { queries: keywords.length, retrievedCandidates: candidates.length, keywordMatchedEvidence: 0, retrievalMs, normalizationMs: 0, lawsMs: 0, totalMs: retrievalMs },
    });
  }

  const rag = await runPublicInterestNewsRag(
    { retriever: { search: async () => scopedEvidence }, egovAi: deps.egovAi },
    { query: keywords.join(" OR "), limit: 20 },
  );
  if (!rag.ok) return rag;
  const evidenceByUrl = new Map(scopedEvidence.map((item) => [item.url, item]));
  const signals = rag.value.signals.flatMap((signal): WeeklyAccountabilitySignal[] => {
    const evidence = evidenceByUrl.get(signal.sourceUrl);
    if (!evidence) return [];
    const matchedKeywords = matchedAccountabilityKeywords(evidence, keywords);
    if (matchedKeywords.length === 0) return [];
    return [{ ...signal, allegationCategory: categoryForKeywords(matchedKeywords), matchedKeywords }];
  });
  const eReportDrafts = signals.map((signal) => ({
    draftId: draftId(signal),
    status: "HUMAN_REVIEW_REQUIRED" as const,
    reportType: "public_integrity_review" as const,
    subject: `Public-integrity review: ${signal.sourceTitle}`,
    summary: signal.claimSummary,
    category: signal.allegationCategory,
    sourceUrls: [signal.sourceUrl],
    matchedKeywords: signal.matchedKeywords,
  }));

  return ok({
    schemaVersion: "1.0",
    runId: input.runId,
    generatedAt: input.generatedAt,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    keywords,
    evidence: scopedEvidence,
    signals,
    eReportDrafts,
    legalContext: rag.value.legalContext,
    metrics: {
      queries: keywords.length,
      retrievedCandidates: candidates.length,
      keywordMatchedEvidence: scopedEvidence.length,
      retrievalMs,
      normalizationMs: rag.value.metrics.normalizationMs,
      lawsMs: rag.value.metrics.lawsMs,
      totalMs: Number((retrievalMs + rag.value.metrics.totalMs).toFixed(2)),
    },
  });
}
