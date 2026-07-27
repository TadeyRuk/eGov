const DEFAULT_BASE_URL = "https://dbm-ws.oueg.info";
const PROGRAMS = ["FALGU", "GEF", "SBDP"];

function json(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function number(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function project(row, index) {
  const saro = number(row.amountSaro);
  const nca = number(row.amountNca);
  const total = number(row.amountTotal);
  const utilization = Math.max(0, Math.min(100, Math.round((nca / (saro || total || 1)) * 100)));
  const status = utilization >= 100 ? "Tapos na" : utilization <= 0 ? "Naantala" : "Ongoing";
  return {
    id: text(row.id, `${text(row.programCode, "LGSF")}:${text(row.fiscalYear, "na")}:${index}`),
    title: text(row.projectName, "Hindi pinangalanang proyekto"),
    agency: text(row.programCode, "LGSF"),
    location: [row.barangay, row.cityMunicipality, row.province, row.region].map((value) => text(value)).filter(Boolean).join(", ") || "—",
    utilization,
    status,
    statusColor: status === "Tapos na" ? "#16A34A" : status === "Naantala" ? "#B91C1C" : "#2563EB",
    programCode: text(row.programCode, "LGSF"),
  };
}

export default async function handler(request, response) {
  if (request.method !== "GET") return json(response, 405, { error: "Method not allowed" });
  const apiKey = process.env.DBM_COMPASS_API_KEY?.trim();
  if (!apiKey) return json(response, 503, { error: "DBM Compass is not configured" });

  const requested = text(request.query?.programCode, "ALL").toUpperCase();
  const programs = requested === "ALL" ? PROGRAMS : [requested];
  const reportYear = Math.max(2000, Math.min(2100, Number(request.query?.reportYear) || new Date().getFullYear()));
  const page = Math.max(1, Number(request.query?.page) || 1);
  const limit = Math.max(1, Math.min(25, Number(request.query?.limit) || 10));
  const baseUrl = (process.env.DBM_COMPASS_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
  try {
    const settled = await Promise.all(programs.map(async (programCode) => {
      const params = new URLSearchParams({ programCode, reportYear: String(reportYear), page: String(page), limit: String(limit) });
      const upstream = await fetch(`${baseUrl}/api/v1/records/lgsf/dashboard?${params}`, { headers: { accept: "application/json", "X-API-Key": apiKey } });
      const body = await upstream.json().catch(() => ({}));
      if (!upstream.ok) throw new Error(`DBM ${upstream.status}`);
      const rows = Array.isArray(body?.projects?.rows) ? body.projects.rows : [];
      return { rows, total: number(body?.projects?.total) };
    }));
    const projects = settled.flatMap((entry) => entry.rows).map(project);
    const total = settled.reduce((sum, entry) => sum + entry.total, 0);
    console.info(JSON.stringify({ event: "dbm_lgsf_projects_loaded", count: projects.length }));
    return json(response, 200, { reportYear, total, projects });
  } catch (cause) {
    console.error(JSON.stringify({ event: "dbm_lgsf_fetch_failed", message: cause instanceof Error ? cause.message : "unknown" }));
    return json(response, 502, { error: "DBM Compass is unavailable" });
  }
}
