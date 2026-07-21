import { appError, err, ok, type Result } from "@egov/shared";
import type { DbmCompassPort, PlatformJson } from "../ports/index.js";

export const LGSF_PROGRAM_CODES = [
  "FALGU",
  "GEF",
  "GGG",
  "SBDP",
  "SAFPB",
] as const;

export type LgsfProgramCode = (typeof LGSF_PROGRAM_CODES)[number] | string;

export type TransparencyProject = {
  readonly id: string;
  readonly title: string;
  readonly agency: string;
  readonly location: string;
  readonly utilization: number;
  readonly status: "Ongoing" | "Tapos na" | "Naantala";
  readonly statusColor: string;
  readonly programCode: string;
  readonly fiscalYear: number | null;
  readonly amountSaro: number;
  readonly amountNca: number;
  readonly amountTotal: number;
};

export type ListTransparencyProjectsDeps = {
  readonly dbmCompass: DbmCompassPort;
};

export type ListTransparencyProjectsInput = {
  readonly programCode?: LgsfProgramCode;
  readonly reportYear?: number;
  readonly region?: string;
  readonly province?: string;
  readonly municipality?: string;
  readonly page?: number;
  readonly limit?: number;
};

export type ListTransparencyProjectsResult = {
  readonly reportYear: number;
  readonly projects: readonly TransparencyProject[];
  readonly total: number;
};

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** NCA vs SARO (fallback: amountTotal) — cash released against allotment. */
export function utilizationFromAmounts(input: {
  amountSaro: number;
  amountNca: number;
  amountTotal: number;
}): number {
  const denom = input.amountSaro > 0 ? input.amountSaro : input.amountTotal;
  if (denom <= 0) return 0;
  return clampPercent((input.amountNca / denom) * 100);
}

export function statusFromUtilization(utilization: number): {
  status: TransparencyProject["status"];
  statusColor: string;
} {
  if (utilization >= 100) {
    return { status: "Tapos na", statusColor: "#16A34A" };
  }
  if (utilization <= 0) {
    return { status: "Naantala", statusColor: "#B91C1C" };
  }
  return { status: "Ongoing", statusColor: "#2563EB" };
}

function formatLocation(row: PlatformJson): string {
  const parts = [
    asTrimmedString(row.barangay),
    asTrimmedString(row.cityMunicipality),
    asTrimmedString(row.province),
    asTrimmedString(row.region),
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(", ") : "—";
}

function projectId(row: PlatformJson, index: number): string {
  const explicit = asTrimmedString(row.id);
  if (explicit) return explicit;
  const program = asTrimmedString(row.programCode) ?? "LGSF";
  const year = asFiniteNumber(row.fiscalYear) ?? "na";
  const name = asTrimmedString(row.projectName) ?? `row-${index}`;
  const place = formatLocation(row);
  return `${program}:${year}:${name}:${place}`.slice(0, 180);
}

/** Map one DBM Compass LGSF dashboard/record project row into UI DTO. */
export function mapLgsfProjectRow(
  row: PlatformJson,
  index = 0,
): TransparencyProject | null {
  const title = asTrimmedString(row.projectName);
  if (!title) return null;

  const programCode = asTrimmedString(row.programCode) ?? "LGSF";
  const amountSaro = asFiniteNumber(row.amountSaro) ?? 0;
  const amountNca = asFiniteNumber(row.amountNca) ?? 0;
  const amountTotal = asFiniteNumber(row.amountTotal) ?? 0;
  const utilization = utilizationFromAmounts({
    amountSaro,
    amountNca,
    amountTotal,
  });
  const { status, statusColor } = statusFromUtilization(utilization);

  return {
    id: projectId(row, index),
    title,
    agency: programCode,
    location: formatLocation(row),
    utilization,
    status,
    statusColor,
    programCode,
    fiscalYear: asFiniteNumber(row.fiscalYear),
    amountSaro,
    amountNca,
    amountTotal,
  };
}

function extractProjectRows(raw: PlatformJson): PlatformJson[] {
  const projects = raw.projects;
  if (projects && typeof projects === "object") {
    const rows = (projects as PlatformJson).rows;
    if (Array.isArray(rows)) {
      return rows.filter((row): row is PlatformJson => !!row && typeof row === "object");
    }
  }
  if (Array.isArray(raw.items)) {
    return raw.items.filter((row): row is PlatformJson => !!row && typeof row === "object");
  }
  if (Array.isArray(raw.data)) {
    return raw.data.filter((row): row is PlatformJson => !!row && typeof row === "object");
  }
  return [];
}

function extractTotal(raw: PlatformJson, mappedCount: number): number {
  const projects = raw.projects;
  if (projects && typeof projects === "object") {
    const total = asFiniteNumber((projects as PlatformJson).total);
    if (total !== null) return total;
  }
  const total = asFiniteNumber(raw.total);
  if (total !== null) return total;
  return mappedCount;
}

async function fetchProgramProjects(
  deps: ListTransparencyProjectsDeps,
  programCode: string,
  input: ListTransparencyProjectsInput,
  reportYear: number,
): Promise<Result<{ reportYear: number; projects: TransparencyProject[]; total: number }>> {
  const page = input.page ?? 1;
  const limit = input.limit ?? 25;
  const dashboard = await deps.dbmCompass.getLgsfDashboard({
    programCode,
    reportYear,
    page,
    limit,
    ...(input.region !== undefined ? { region: input.region } : {}),
    ...(input.province !== undefined ? { province: input.province } : {}),
    ...(input.municipality !== undefined
      ? { municipality: input.municipality }
      : {}),
  });

  if (!dashboard.ok) {
    return err(
      appError(
        "UNAVAILABLE",
        `DBM Compass LGSF dashboard failed (${programCode}): ${dashboard.error.message}`,
        dashboard.error,
      ),
    );
  }

  const rows = extractProjectRows(dashboard.value);
  const projects = rows
    .map((row, index) => mapLgsfProjectRow(row, index))
    .filter((row): row is TransparencyProject => row !== null);

  return ok({
    reportYear: asFiniteNumber(dashboard.value.reportYear) ?? reportYear,
    projects,
    total: extractTotal(dashboard.value, projects.length),
  });
}

/**
 * List LGSF projects from DBM Compass for the Transparency screen.
 * Pass a program code, or omit / use `ALL` to merge live FALGU + GEF + SBDP rows.
 */
export async function listTransparencyProjects(
  deps: ListTransparencyProjectsDeps,
  input: ListTransparencyProjectsInput = {},
): Promise<Result<ListTransparencyProjectsResult>> {
  const reportYear = input.reportYear ?? new Date().getFullYear();
  const requested = (input.programCode ?? "ALL").trim().toUpperCase() || "ALL";

  const programCodes =
    requested === "ALL"
      ? (["FALGU", "GEF", "SBDP"] as const)
      : ([requested] as const);

  const settled = await Promise.all(
    programCodes.map((code) => fetchProgramProjects(deps, code, input, reportYear)),
  );

  const failures = settled.filter((result) => !result.ok);
  const successes = settled.filter(
    (
      result,
    ): result is Extract<(typeof settled)[number], { ok: true }> => result.ok,
  );

  if (successes.length === 0) {
    return failures[0] ?? err(appError("UNAVAILABLE", "DBM Compass LGSF dashboard failed"));
  }

  const projects = successes.flatMap((result) => result.value.projects);
  const total = successes.reduce((sum, result) => sum + result.value.total, 0);
  const year =
    successes.find((result) => result.value.reportYear)?.value.reportYear ??
    reportYear;

  return ok({
    reportYear: year,
    projects,
    total,
  });
}
