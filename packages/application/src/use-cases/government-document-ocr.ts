import type { EgovAiPort } from "../ports/platform.js";
import { appError, type AppError } from "@egov/shared";

export type DocumentVisibility = "PRIVATE_INDIVIDUAL" | "POLICY_GATED_BUSINESS" | "PUBLIC_GOVERNMENT";

export type NormalizeGovernmentDocumentInput = {
  readonly file: { readonly bytes: Uint8Array | ArrayBuffer | Blob; readonly filename: string; readonly contentType?: string };
  readonly visibility: DocumentVisibility;
  readonly expectedDocumentType?: string;
};

export type NormalizedGovernmentDocument = {
  readonly schemaVersion: "1.0";
  readonly documentType: string;
  readonly issuerAgencyCode: string;
  readonly fiscalYear: number | null;
  readonly publicTitle: string;
  readonly publicSourceUrl: string;
  readonly fields: Readonly<Record<string, string | number | boolean | null>>;
  readonly warnings: readonly string[];
};

export type NormalizeGovernmentDocumentOutcome =
  | { readonly ok: true; readonly value: { readonly normalized: NormalizedGovernmentDocument; readonly extractedText: string; readonly metrics: { readonly extractorMs: number; readonly normalizerMs: number; readonly totalMs: number } } }
  | { readonly ok: false; readonly error: AppError };

function parseJson(raw: string): Record<string, unknown> | undefined {
  const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

export async function normalizeGovernmentDocument(
  egovAi: EgovAiPort,
  input: NormalizeGovernmentDocumentInput,
): Promise<NormalizeGovernmentDocumentOutcome> {
  const started = performance.now();
  if (!input.file.filename.trim()) return { ok: false, error: appError("VALIDATION", "filename is required") };
  const token = await egovAi.token();
  if (!token.ok) return token;
  const extractorStarted = performance.now();
  const extracted = await egovAi.documentExtractor({ token: token.value.accessToken, file: input.file });
  const extractorMs = Number((performance.now() - extractorStarted).toFixed(2));
  if (!extracted.ok) return extracted;

  const normalizerStarted = performance.now();
  const normalized = await egovAi.aiAssistant({
    token: token.value.accessToken,
    category: "PH",
    prompt: [
      "Normalize this OCR text into ONLY one JSON object.",
      '{"schemaVersion":"1.0","documentType":"","issuerAgencyCode":"","fiscalYear":null,"publicTitle":"","publicSourceUrl":"","fields":{},"warnings":[]}',
      `Expected type: ${input.expectedDocumentType ?? "infer"}. Visibility: ${input.visibility}.`,
      "Do not invent missing values. Put uncertainty in warnings.",
      "For PRIVATE_INDIVIDUAL or POLICY_GATED_BUSINESS, publicTitle and publicSourceUrl MUST be empty.",
      "Extracted OCR text follows:",
      extracted.value.data.slice(0, 20_000),
    ].join("\n"),
  });
  const normalizerMs = Number((performance.now() - normalizerStarted).toFixed(2));
  if (!normalized.ok) return normalized;
  const parsed = parseJson(normalized.value.data);
  if (!parsed || parsed.schemaVersion !== "1.0" || typeof parsed.documentType !== "string" || typeof parsed.issuerAgencyCode !== "string" || !parsed.fields || typeof parsed.fields !== "object" || Array.isArray(parsed.fields)) {
    return { ok: false, error: appError("VALIDATION", "AI returned an invalid normalized document schema") };
  }
  const isPrivate = input.visibility !== "PUBLIC_GOVERNMENT";
  const value: NormalizedGovernmentDocument = {
    schemaVersion: "1.0",
    documentType: parsed.documentType,
    issuerAgencyCode: parsed.issuerAgencyCode,
    fiscalYear: typeof parsed.fiscalYear === "number" && Number.isInteger(parsed.fiscalYear) ? parsed.fiscalYear : null,
    publicTitle: isPrivate ? "" : typeof parsed.publicTitle === "string" ? parsed.publicTitle : "",
    publicSourceUrl: isPrivate ? "" : typeof parsed.publicSourceUrl === "string" ? parsed.publicSourceUrl : "",
    fields: parsed.fields as Record<string, string | number | boolean | null>,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.filter((item): item is string => typeof item === "string") : [],
  };
  return { ok: true, value: { normalized: value, extractedText: extracted.value.data, metrics: { extractorMs, normalizerMs, totalMs: Number((performance.now() - started).toFixed(2)) } } };
}
