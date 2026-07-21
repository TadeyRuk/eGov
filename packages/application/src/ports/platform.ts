import type { Result } from "@egov/shared";

/** Shared HTTP-ish failure mapping for platform adapters. */
export type PlatformJson = Record<string, unknown>;

// ─── eGov SSO ───────────────────────────────────────────────────────────────

/** Official standard login scope for `POST /api/token` (see docs/platform-apis.md). */
export const EGOV_SSO_SCOPE_AUTHENTICATION = "SSO_AUTHENTICATION" as const;

export type EgovSsoTokenRequest = {
  readonly exchangeCode: string;
  /** Defaults to `SSO_AUTHENTICATION` when omitted by callers. */
  readonly scope: string;
};

export type EgovSsoToken = {
  readonly accessToken: string;
  readonly tokenType?: string;
  readonly expiresIn?: number;
  readonly raw: PlatformJson;
};

export type EgovSsoCitizenProfile = {
  readonly raw: PlatformJson;
  readonly uniqid?: string;
  readonly fullName?: string;
  readonly firstName?: string;
  readonly middleName?: string;
  readonly lastName?: string;
  readonly birthdate?: string;
  readonly address?: string;
  readonly email?: string;
  readonly contactNumber?: string;
};

export type EgovSsoPort = {
  exchangeToken(input: EgovSsoTokenRequest): Promise<Result<EgovSsoToken>>;
  authenticatePartner(
    accessToken: string,
  ): Promise<Result<EgovSsoCitizenProfile>>;
};

// ─── eVerify ────────────────────────────────────────────────────────────────

/**
 * Auth token from `POST /api/auth`. Official shape nests under `data`
 * (`data.access_token`); adapters unwrap into `token`.
 */
export type EVerifyAuthResult = {
  readonly token: string;
  readonly raw: PlatformJson;
};

/**
 * Documented fields for eVerify Tier `POST /api/query` (demographics +
 * Face Liveness Web SDK session). Port still accepts `PlatformJson` so
 * QR and future dashboard fields are not blocked.
 */
export type EVerifyPersonalInfoFields = {
  readonly first_name: string;
  readonly middle_name?: string;
  readonly last_name: string;
  readonly suffix?: string;
  /** ISO date `YYYY-MM-DD`. */
  readonly birth_date: string;
  /** From eVerify Face Liveness Web SDK `result.session_id` — not the Face Liveness API session. */
  readonly face_liveness_session_id: string;
};

export type EVerifyQueryInput = {
  readonly token: string;
  readonly payload: PlatformJson;
};

export type EVerifyQueryResult = {
  readonly raw: PlatformJson;
};

export type EVerifyPort = {
  authenticate(credentials?: PlatformJson): Promise<Result<EVerifyAuthResult>>;
  verifyPersonalInfo(input: EVerifyQueryInput): Promise<Result<EVerifyQueryResult>>;
  checkQr(input: EVerifyQueryInput): Promise<Result<EVerifyQueryResult>>;
  verifyQr(input: EVerifyQueryInput): Promise<Result<EVerifyQueryResult>>;
};

// ─── Face Liveness (platform REST API — separate from eVerify Web SDK) ──────
//
// Pass rule: SUCCEEDED && confidence >= 95.0.
// eVerify Tier identity verification uses the eVerify Face Liveness *Web SDK*
// and field `face_liveness_session_id` on `/api/query` — see platform-apis.md.

export type FaceLivenessSessionAction = "redirect" | "post" | "close";

export type FaceLivenessCreateSessionInput = {
  readonly action: FaceLivenessSessionAction;
  /** Required when action is "redirect". */
  readonly callbackUrl?: string;
  /** Milliseconds to show the completion-check screen. Platform default: 3000. */
  readonly delay?: number;
};

export type FaceLivenessSession = {
  /** Session token — pass to getResult as sessionToken. */
  readonly token: string;
  /** URL the citizen visits in-device to perform the liveness capture. */
  readonly url: string;
  readonly raw: PlatformJson;
};

export type FaceLivenessResult = {
  readonly status: string;
  readonly confidence: number | null;
  /** True only when status is SUCCEEDED and confidence >= 95.0 */
  readonly passed: boolean;
  readonly referenceImageUrl?: string;
  readonly raw: PlatformJson;
};

export type FaceLivenessPort = {
  createSession(
    input: FaceLivenessCreateSessionInput,
  ): Promise<Result<FaceLivenessSession>>;
  getResult(sessionToken: string): Promise<Result<FaceLivenessResult>>;
};

export const FACE_LIVENESS_MIN_CONFIDENCE = 95.0;

export function isFaceLivenessPassed(
  status: string,
  confidence: number | null,
): boolean {
  return status === "SUCCEEDED" && confidence !== null && confidence >= FACE_LIVENESS_MIN_CONFIDENCE;
}

// ─── eMessage ───────────────────────────────────────────────────────────────

export type EMessageSmsPushInput = {
  /** E.164 recipient, e.g. `+639090000000` (wire field `number`). */
  readonly number: string;
  readonly message: string;
};

export type EMessageSmsPushResult = {
  readonly raw: PlatformJson;
};

export type EMessagePort = {
  pushSms(input: EMessageSmsPushInput): Promise<Result<EMessageSmsPushResult>>;
};

// ─── eGov AI ────────────────────────────────────────────────────────────────
// Grounded on docs/platform-apis.md §4 — paths under /api/v1/egov/integration/.

export type EgovAiTokenResult = {
  /** Bearer value for subsequent eGov AI calls (`access_token`). */
  readonly accessToken: string;
  /** @deprecated Prefer `accessToken` — kept for older call sites. */
  readonly token: string;
  readonly expiresInSeconds?: number;
  readonly creditsTotal?: number;
  readonly creditsRemaining?: number;
  readonly raw: PlatformJson;
};

export type EgovAiGenerateInput = {
  /** Optional Bearer; when omitted the adapter mints via `token()`. */
  readonly token?: string;
  readonly prompt: string;
  /** Category label (official examples use `"PH"`). */
  readonly category: string;
};

export type EgovAiGenerateResult = {
  readonly data: string;
  readonly sessionId: string;
  readonly raw: PlatformJson;
};

export type EgovAiTranslatorInput = {
  readonly token?: string;
  readonly prompt: string;
  /** ISO 639-1 source language (e.g. `en`). */
  readonly sourceLang: string;
  /** ISO 639-1 target language (e.g. `fil`). */
  readonly targetLang: string;
};

export type EgovAiTranslatorResult = {
  readonly originalPrompt: string;
  readonly sourceLang: string;
  readonly targetLang: string;
  readonly translateFrom?: { readonly code: string; readonly label: string };
  readonly translatedPrompt: string;
  readonly transliteratedPrompt?: string;
  readonly raw: PlatformJson;
};

export type EgovAiDocumentFile = {
  readonly bytes: Uint8Array | ArrayBuffer | Blob;
  readonly filename: string;
  /** e.g. `image/jpeg`, `image/png`, `application/pdf` */
  readonly contentType?: string;
};

export type EgovAiDocumentExtractorInput = {
  readonly token?: string;
  readonly file: EgovAiDocumentFile;
};

export type EgovAiDocumentExtractorResult = {
  readonly data: string;
  readonly raw: PlatformJson;
};

export type EgovAiCreditsResult = {
  readonly creditsTotal: number;
  readonly creditsUsed: number;
  readonly creditsRemaining: number;
  readonly expiresAt?: string;
  readonly raw: PlatformJson;
};

export type EgovAiPort = {
  /** `POST …/token` — body `{ access_code }` from env. */
  token(): Promise<Result<EgovAiTokenResult>>;
  aiAssistant(input: EgovAiGenerateInput): Promise<Result<EgovAiGenerateResult>>;
  speechMaker(input: EgovAiGenerateInput): Promise<Result<EgovAiGenerateResult>>;
  tourism(input: EgovAiGenerateInput): Promise<Result<EgovAiGenerateResult>>;
  laws(input: EgovAiGenerateInput): Promise<Result<EgovAiGenerateResult>>;
  translator(input: EgovAiTranslatorInput): Promise<Result<EgovAiTranslatorResult>>;
  documentExtractor(
    input: EgovAiDocumentExtractorInput,
  ): Promise<Result<EgovAiDocumentExtractorResult>>;
  /** `GET …/credits` — Bearer required (minted when omitted). */
  credits(token?: string): Promise<Result<EgovAiCreditsResult>>;
};

// ─── eGovPay ────────────────────────────────────────────────────────────────
//
// Wire contract (docs/platform-apis.md §5):
// POST /api/v1/transaction — body includes digest = HMAC-SHA256("$amount|$txnid", token)
// GET  /api/v1/transaction/:uuid
// PUT  /api/v1/transaction/:uuid/void

export type EgovPayGenerateInput = {
  /** Must include items, amount, txnid, redirect_url, callback_url; settlement_template_uuid optional if env set. Adapter recomputes digest. */
  readonly payload: PlatformJson;
};

export type EgovPayTransaction = {
  readonly transactionId?: string;
  readonly raw: PlatformJson;
};

export type EgovPayPort = {
  generatePayment(input: EgovPayGenerateInput): Promise<Result<EgovPayTransaction>>;
  getTransaction(transactionId: string): Promise<Result<EgovPayTransaction>>;
  voidTransaction(transactionId: string, payload?: PlatformJson): Promise<Result<EgovPayTransaction>>;
};

// ─── eGovChain (JSON-RPC) ───────────────────────────────────────────────────

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  readonly method: string;
  readonly params?: unknown;
  readonly id?: JsonRpcId;
};

export type JsonRpcSuccess = {
  readonly result: unknown;
  readonly id: JsonRpcId;
  readonly raw: PlatformJson;
};

export type EgovChainPort = {
  /** Generic JSON-RPC 2.0 call — prefer this over enumerating ~60 methods. */
  call(request: JsonRpcRequest): Promise<Result<JsonRpcSuccess>>;
  ethCall(params: unknown): Promise<Result<JsonRpcSuccess>>;
  ethSendRawTransaction(signedTx: string): Promise<Result<JsonRpcSuccess>>;
  ethGetTransactionReceipt(txHash: string): Promise<Result<JsonRpcSuccess>>;
  ethBlockNumber(): Promise<Result<JsonRpcSuccess>>;
  ethGetBalance(address: string, block?: string): Promise<Result<JsonRpcSuccess>>;
};

// ─── eReport ────────────────────────────────────────────────────────────────
// Grounded on the live dashboard API reference (platforms.e.gov.ph/dashboard/
// api-catalogs/ereport), captured 2026-07-22. Base path: /api/integration/.
// Three distinct tokens, not one:
//   1. access_token ("integration_token") — from POST /token, Bearer for
//      datasets/submit_complaint/verify.
//   2. report_view_token — from POST /verify/confirm (after OTP), header
//      X-EReport-View-Token for reports list/view. Separate lifecycle.
//   3. access_code — the pre-issued env credential used to obtain #1.

export type EReportTokenResult = {
  readonly accessToken: string;
  readonly expiresAt?: string;
  readonly raw: PlatformJson;
};

/** Shared JSON:API `{type, id, attributes}` shape used by all five dataset
 * list endpoints (report types, regions, provinces, municipalities, barangays). */
export type EReportDatasetItem = {
  readonly id: string;
  readonly type: string;
  readonly attributes: PlatformJson;
};

export type EReportComplaintInput = {
  readonly accessToken: string;
  /** E.164-ish, e.g. `639171234567` per dashboard examples. */
  readonly mobile: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly gender: string;
  readonly complainantEmail: string;
  /** One of the codes returned by getReportTypes(), e.g. "crime", "red_tape". */
  readonly reportType: string;
  readonly subject: string;
  readonly message: string;
  readonly evidences?: readonly string[];
  readonly regionCode: string;
  readonly provinceCode: string;
  readonly municipalityCode: string;
  readonly barangayCode: string;
  readonly latitude?: string;
  readonly longitude?: string;
};

export type EReportComplaintResult = {
  readonly code: number;
  readonly message: string;
  readonly caseNumber: string;
  readonly raw: PlatformJson;
};

export type EReportOtpRequestInput = {
  readonly accessToken: string;
  readonly email: string;
};

export type EReportOtpRequestResult = {
  readonly code: number;
  readonly alreadyVerified: boolean;
  readonly message: string;
  readonly raw: PlatformJson;
};

export type EReportOtpConfirmInput = {
  readonly accessToken: string;
  readonly email: string;
  readonly otp: string;
};

export type EReportOtpConfirmResult = {
  readonly code: number;
  readonly reportViewToken: string;
  readonly expiresAt?: string;
  readonly raw: PlatformJson;
};

export type EReportListInput = {
  readonly viewToken: string;
  readonly q?: string;
  readonly page?: number;
  readonly limit?: number;
};

export type EReportListedReport = {
  readonly id: string;
  readonly caseNumber: string;
  readonly status: string;
  readonly formattedStatus: string;
  readonly raw: PlatformJson;
};

export type EReportListResult = {
  readonly reports: readonly EReportListedReport[];
  readonly total: number;
  readonly currentPage: number;
  readonly totalPages: number;
  readonly raw: PlatformJson;
};

export type EReportViewInput = {
  readonly viewToken: string;
  readonly caseNumber: string;
};

export type EReportViewResult = {
  readonly id: string;
  readonly caseNumber: string;
  readonly status: string;
  readonly formattedStatus: string;
  readonly raw: PlatformJson;
};

export type EReportPort = {
  getReportTypes(accessToken: string): Promise<Result<readonly EReportDatasetItem[]>>;
  getRegions(accessToken: string): Promise<Result<readonly EReportDatasetItem[]>>;
  getProvinces(
    accessToken: string,
    regionCode: string,
  ): Promise<Result<readonly EReportDatasetItem[]>>;
  getMunicipalities(
    accessToken: string,
    provinceCode: string,
  ): Promise<Result<readonly EReportDatasetItem[]>>;
  getBarangays(
    accessToken: string,
    municipalityCode: string,
  ): Promise<Result<readonly EReportDatasetItem[]>>;
  /** POST /token — body { access_code }, no auth header. */
  generateToken(accessCode: string): Promise<Result<EReportTokenResult>>;
  submitComplaint(input: EReportComplaintInput): Promise<Result<EReportComplaintResult>>;
  requestOtp(input: EReportOtpRequestInput): Promise<Result<EReportOtpRequestResult>>;
  confirmOtp(input: EReportOtpConfirmInput): Promise<Result<EReportOtpConfirmResult>>;
  listReports(input: EReportListInput): Promise<Result<EReportListResult>>;
  viewReport(input: EReportViewInput): Promise<Result<EReportViewResult>>;
};

// ─── DBM Compass ────────────────────────────────────────────────────────────
// Grounded on docs/platform-apis.md §9 — GET /api/v1/records/* with X-API-Key.

export type DbmCompassDataset = "SAAODB" | "NCA" | "SARO" | "LGSF";

/** Query-string params for GET record/dashboard endpoints (stringified by adapter). */
export type DbmCompassParams = Readonly<Record<string, string | number | boolean>>;

export type DbmCompassQueryInput = {
  readonly dataset: DbmCompassDataset;
  /** Mapped to GET query string on `/api/v1/records/{saaodb|nca|saro|lgsf}`. */
  readonly query: DbmCompassParams;
};

export type DbmCompassQueryResult = {
  readonly dataset: DbmCompassDataset;
  readonly raw: PlatformJson;
};

export type DbmSaaodbRecordsParams = {
  readonly reportYear: number;
  readonly period: "Q1" | "Q2" | "Q3" | "Q4" | "FY" | string;
  readonly page: number;
  readonly limit: number;
  readonly class?: "PS" | "MOOE" | "FINEX" | "CO" | string;
  readonly sheetScope?: "summary" | "agency" | "sucs" | string;
  readonly entityName?: string;
};

export type DbmSaaodbDashboardParams = {
  readonly reportYear: number;
  readonly sheetScope: "summary" | "agency" | "sucs" | string;
};

export type DbmSaaodbEntitiesParams = {
  readonly reportYear: number;
  readonly sheetScope: "agency" | "sucs" | string;
  readonly expandParent?: string;
  readonly expandEntity?: string;
  readonly expandEntityParent?: string;
};

export type DbmNcaRecordsParams = {
  readonly budgetYear: number;
  readonly deptCode?: string;
  readonly agencyCode?: string;
  readonly operatingUnitCode?: string;
  readonly expenseClass?: string;
  readonly page?: number;
  readonly limit?: number;
};

export type DbmSaroRecordsParams = {
  readonly saroNo?: string;
  readonly deptCode?: string;
  readonly agencyCode?: string;
  readonly expenseClass?: string;
  readonly page?: number;
  readonly limit?: number;
};

export type DbmLgsfRecordsParams = {
  readonly fiscalYear?: number;
  readonly programCode?: "FALGU" | "GEF" | "GGG" | "SBDP" | "SAFPB" | string;
  readonly regionCode?: string;
  readonly province?: string;
  readonly cityMunicipality?: string;
  readonly page?: number;
  readonly limit?: number;
};

export type DbmLgsfDashboardParams = {
  readonly programCode: "FALGU" | "GEF" | "GGG" | "SBDP" | "SAFPB" | string;
  readonly reportYear?: number;
  readonly region?: string;
  readonly province?: string;
  readonly municipality?: string;
  readonly page?: number;
  readonly limit?: number;
};

export type DbmCompassPort = {
  /** GET `/api/v1/records/{dataset}` — convenience used by BANGON fund-check. */
  query(input: DbmCompassQueryInput): Promise<Result<DbmCompassQueryResult>>;
  getSaaodbRecords(params: DbmSaaodbRecordsParams): Promise<Result<PlatformJson>>;
  getSaaodbDashboard(params: DbmSaaodbDashboardParams): Promise<Result<PlatformJson>>;
  getSaaodbEntities(params: DbmSaaodbEntitiesParams): Promise<Result<PlatformJson>>;
  getNcaRecords(params: DbmNcaRecordsParams): Promise<Result<PlatformJson>>;
  getSaroRecords(params: DbmSaroRecordsParams): Promise<Result<PlatformJson>>;
  getLgsfRecords(params: DbmLgsfRecordsParams): Promise<Result<PlatformJson>>;
  getLgsfDashboard(params: DbmLgsfDashboardParams): Promise<Result<PlatformJson>>;
};
