import type { Result } from "@egov/shared";

/** Shared HTTP-ish failure mapping for platform adapters. */
export type PlatformJson = Record<string, unknown>;

// ─── eGov SSO ───────────────────────────────────────────────────────────────

export type EgovSsoTokenRequest = {
  readonly exchangeCode: string;
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
};

export type EgovSsoPort = {
  exchangeToken(input: EgovSsoTokenRequest): Promise<Result<EgovSsoToken>>;
  authenticatePartner(
    accessToken: string,
  ): Promise<Result<EgovSsoCitizenProfile>>;
};

// ─── eVerify ────────────────────────────────────────────────────────────────

export type EVerifyAuthResult = {
  readonly token: string;
  readonly raw: PlatformJson;
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

// ─── Face Liveness ──────────────────────────────────────────────────────────

export type FaceLivenessSession = {
  readonly sessionId: string;
  readonly raw: PlatformJson;
};

export type FaceLivenessResult = {
  readonly status: string;
  readonly confidence: number | null;
  /** True only when status is SUCCEEDED and confidence >= 95.0 */
  readonly passed: boolean;
  readonly raw: PlatformJson;
};

export type FaceLivenessPort = {
  createSession(payload?: PlatformJson): Promise<Result<FaceLivenessSession>>;
  getResult(sessionId: string): Promise<Result<FaceLivenessResult>>;
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
  readonly to: string;
  readonly message: string;
  readonly meta?: PlatformJson;
};

export type EMessageSmsPushResult = {
  readonly raw: PlatformJson;
};

export type EMessagePort = {
  pushSms(input: EMessageSmsPushInput): Promise<Result<EMessageSmsPushResult>>;
};

// ─── eGov AI ────────────────────────────────────────────────────────────────

export type EgovAiTokenResult = {
  readonly token: string;
  readonly raw: PlatformJson;
};

export type EgovAiRequest = {
  readonly token?: string;
  readonly payload: PlatformJson;
};

export type EgovAiResponse = {
  readonly raw: PlatformJson;
};

export type EgovAiPort = {
  token(credentials?: PlatformJson): Promise<Result<EgovAiTokenResult>>;
  aiAssistant(input: EgovAiRequest): Promise<Result<EgovAiResponse>>;
  speechMaker(input: EgovAiRequest): Promise<Result<EgovAiResponse>>;
  tourism(input: EgovAiRequest): Promise<Result<EgovAiResponse>>;
  laws(input: EgovAiRequest): Promise<Result<EgovAiResponse>>;
  translator(input: EgovAiRequest): Promise<Result<EgovAiResponse>>;
  documentExtractor(input: EgovAiRequest): Promise<Result<EgovAiResponse>>;
  credits(input: EgovAiRequest): Promise<Result<EgovAiResponse>>;
};

// ─── eGovPay ────────────────────────────────────────────────────────────────

export type EgovPayGenerateInput = {
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

export type EReportTokenResult = {
  readonly token: string;
  readonly raw: PlatformJson;
};

export type EReportRequest = {
  readonly token?: string;
  readonly payload?: PlatformJson;
};

export type EReportResponse = {
  readonly raw: PlatformJson;
};

export type EReportPort = {
  datasets(input?: EReportRequest): Promise<Result<EReportResponse>>;
  token(credentials?: PlatformJson): Promise<Result<EReportTokenResult>>;
  submitComplaint(input: EReportRequest): Promise<Result<EReportResponse>>;
  verifyOtp(input: EReportRequest): Promise<Result<EReportResponse>>;
  listReports(input?: EReportRequest): Promise<Result<EReportResponse>>;
  viewReport(reportId: string, input?: EReportRequest): Promise<Result<EReportResponse>>;
};

// ─── DBM Compass ────────────────────────────────────────────────────────────

export type DbmCompassDataset = "SAAODB" | "NCA" | "SARO" | "LGSF";

export type DbmCompassQueryInput = {
  readonly dataset: DbmCompassDataset;
  readonly query: PlatformJson;
};

export type DbmCompassQueryResult = {
  readonly dataset: DbmCompassDataset;
  readonly raw: PlatformJson;
};

export type DbmCompassPort = {
  query(input: DbmCompassQueryInput): Promise<Result<DbmCompassQueryResult>>;
};
