const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";

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
  firstName: string;
  lastName: string;
  middleName?: string;
  suffix?: string;
  birthDate: string;
  civilStatus: string;
  vitalStatus: string;
};

export const api = {
  exchangeSso: (exchangeCode: string) =>
    post<SsoExchangeResult>("/auth/sso/exchange", { exchangeCode }),
  ssoProfile: (accessToken: string) =>
    post<SsoProfile>("/auth/sso/profile", { accessToken }),

  createLivenessSession: (action: "redirect" | "post" | "close" = "post") =>
    post<{ sessionToken: string; url?: string }>("/bangon/liveness/session", { action }),
  getLivenessResult: (sessionToken: string) =>
    get<{ status: string; confidence?: number }>(
      `/bangon/liveness/result/${encodeURIComponent(sessionToken)}`,
    ),

  confirmIdentity: (input: {
    token: string;
    sessionToken: string;
    faceLivenessSessionId: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    middleName?: string;
    suffix?: string;
  }) => post<{ citizenId: string }>("/bangon/confirm-identity", input),

  findMatches: (input: {
    citizenId: string;
    profile: { dateOfBirth: string; civilStatus: string; vitalStatus: string };
  }) => post<{ matches: Array<{ id: string; benefitId: string }> }>("/bangon/matches", input),

  notify: (matchId: string, citizenPhone: string) =>
    post<{ delivered: boolean }>(`/bangon/matches/${matchId}/notify`, { citizenPhone }),
  disburse: (matchId: string, amount: number) =>
    post<{ reference: string }>(`/bangon/matches/${matchId}/disburse`, { amount }),
  anchor: (matchId: string) =>
    post<{ anchorHash: string }>(`/bangon/matches/${matchId}/anchor`, {}),
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
  }) => post<{ caseId: string }>("/bangon/report-non-delivery", input),

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
