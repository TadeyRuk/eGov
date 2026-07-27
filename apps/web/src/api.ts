// Local development still uses the Node API server. In a Vercel build the
// serverless functions live under the same origin at `/api`, so never bake a
// developer machine's localhost address into the public bundle.
const API_BASE = (
  import.meta.env.VITE_API_BASE ?? (import.meta.env.DEV ? "http://localhost:8787" : "/api")
).replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(`API ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });
const get = <T>(path: string) => request<T>(path);

export type SsoExchangeResult = { accessToken: string; scope?: string };
export type SsoProfile = {
  uniqid?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  birthdate?: string;
  address?: string;
  email?: string;
  contactNumber?: string;
};

export type ClientConfig = {
  sso: { environment: string; clientId: string };
  eVerify: { publicKey: string };
};

export type EligibilityProfile = {
  dateOfBirth: string;
  civilStatus: string;
  vitalStatus: string;
};

export type BenefitNotificationResult = {
  status:
    | "SENT"
    | "SUPPRESSED_DUPLICATE"
    | "SUPPRESSED_CATEGORY_COOLDOWN"
    | "SUPPRESSED_DAILY_LIMIT";
  category: string;
  deliveryId?: string;
};

export const api = {
  clientConfig: () => get<ClientConfig>("/client/config"),
  exchangeSso: (exchangeCode: string) =>
    post<SsoExchangeResult>("/auth/sso/exchange", { exchangeCode }),
  ssoProfile: (accessToken: string) =>
    post<SsoProfile>("/auth/sso/profile", { accessToken }),
  completeSso: (exchangeCode: string) =>
    post<{ authenticated: true; profile: SsoProfile }>("/auth/sso/complete", {
      exchangeCode,
    }),

  createLivenessSession: (action: "redirect" | "post" | "close" = "post") =>
    post<{ token: string; url: string }>("/bangon/liveness/session", { action }),
  getLivenessResult: (sessionToken: string) =>
    get<{ status: string; confidence: number | null; passed: boolean }>(
      `/bangon/liveness/result/${encodeURIComponent(sessionToken)}`,
    ),

  confirmIdentity: (input: {
    sessionToken: string;
    faceLivenessSessionId: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    middleName?: string;
    suffix?: string;
  }) => post<EligibilityProfile>("/bangon/confirm-identity", input),

  findMatches: (input: {
    citizenId: string;
    profile: { dateOfBirth: string; civilStatus: string; vitalStatus: string };
  }) =>
    post<Array<{ id: string; benefitId: string; citizenId?: string; matchedAt?: string }>>(
      "/bangon/matches",
      input,
    ),

  notify: (matchId: string, citizenPhone: string) =>
    post<BenefitNotificationResult>(`/bangon/matches/${matchId}/notify`, {
      citizenPhone,
      category: "QUALIFICATION_RESULT",
    }),
  disburse: (matchId: string, amount: number) =>
    post<{ transactionId?: string }>(`/bangon/matches/${matchId}/disburse`, { amount }),
  anchor: (matchId: string) =>
    post<{ hash: string; chainSubmitted: boolean }>(`/bangon/matches/${matchId}/anchor`, {}),
  explain: (matchId: string) =>
    post<{ explanation: string }>(`/bangon/matches/${matchId}/explain`, {}),

  reportNonDelivery: (input: {
    accessToken: string;
    citizenId: string;
    benefitId: string;
    benefitTitle: string;
    mobile: string;
    firstName: string;
    lastName: string;
    gender: string;
    email: string;
    description: string;
    regionCode: string;
    provinceCode: string;
    municipalityCode: string;
    barangayCode: string;
  }) => post<{ caseNumber: string }>("/bangon/report-non-delivery", input),

  transparencyProjects: (query?: {
    programCode?: string;
    reportYear?: number;
    page?: number;
    limit?: number;
  }) => {
    const params = new URLSearchParams();
    if (query?.programCode) params.set("programCode", query.programCode);
    if (query?.reportYear !== undefined) params.set("reportYear", String(query.reportYear));
    if (query?.page !== undefined) params.set("page", String(query.page));
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    const qs = params.toString();
    return get<{
      reportYear: number;
      total: number;
      projects: Array<{
        id: string;
        title: string;
        agency: string;
        location: string;
        utilization: number;
        status: string;
        statusColor: string;
        programCode: string;
      }>;
    }>(`/bangon/transparency/projects${qs ? `?${qs}` : ""}`);
  },
};
