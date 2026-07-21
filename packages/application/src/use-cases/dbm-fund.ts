import type { DbmDataset } from "@egov/domain";
import type { PlatformJson } from "../ports/index.js";

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function hasNonEmptyDataArray(raw: PlatformJson): boolean {
  return Array.isArray(raw.data) && raw.data.length > 0;
}

function positiveTotal(raw: PlatformJson): boolean {
  const total = asFiniteNumber(raw.total);
  return total !== null && total > 0;
}

/**
 * Interpret a successful DBM Compass JSON body as "funded" for BANGON.
 * Transport failures are handled by the caller (fail closed). Empty/zero
 * totals mean unfunded — not an error.
 */
export function isFundedFromDbmResult(
  dataset: DbmDataset,
  raw: PlatformJson,
): boolean {
  if (dataset === "SAAODB") {
    const cascade =
      raw.cascade && typeof raw.cascade === "object"
        ? (raw.cascade as PlatformJson)
        : null;
    if (cascade) {
      const allotments = asFiniteNumber(cascade.allotments);
      if (allotments !== null && allotments > 0) return true;
      const unobligated = asFiniteNumber(cascade.unobligated);
      if (unobligated !== null && unobligated > 0) return true;
      return false;
    }
    return positiveTotal(raw) || hasNonEmptyDataArray(raw);
  }

  // NCA / SARO / LGSF paginated records
  return positiveTotal(raw) || hasNonEmptyDataArray(raw);
}
