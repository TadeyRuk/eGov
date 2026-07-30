import type { EgovSsoCitizenProfile, PlatformJson } from "../ports/index.js";

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function pickScalar(
  obj: PlatformJson,
  ...keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = asNonEmptyString(obj[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function asObject(value: unknown): PlatformJson | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as PlatformJson;
  }
  return undefined;
}

/**
 * Walk common envelope shapes from hackathon SSO (`data`, `user`, `profile`,
 * nested `data.user`, etc.) and return the richest object that looks like a
 * citizen record.
 */
function unwrapProfileRoot(raw: PlatformJson): PlatformJson {
  const candidates: PlatformJson[] = [raw];
  const data = asObject(raw.data);
  if (data) {
    candidates.push(data);
    for (const nestedKey of ["user", "profile", "citizen", "account"] as const) {
      const nested = asObject(data[nestedKey]);
      if (nested) candidates.push(nested);
    }
  }
  for (const key of ["user", "profile", "citizen", "account", "result"] as const) {
    const nested = asObject(raw[key]);
    if (nested) candidates.push(nested);
  }

  const score = (obj: PlatformJson): number => {
    let n = 0;
    for (const key of Object.keys(obj)) {
      if (
        /uniqid|unique_id|uniqueid|user_id|userid|subject|sub\b|egov/i.test(key)
      ) {
        n += 3;
      }
      if (/first_name|firstname|last_name|lastname|birth|email|mobile|name/i.test(key)) {
        n += 1;
      }
    }
    return n;
  };

  let best = raw;
  let bestScore = score(raw);
  for (const candidate of candidates) {
    const s = score(candidate);
    if (s > bestScore) {
      best = candidate;
      bestScore = s;
    }
  }
  return best;
}

const UNIQID_KEYS = [
  "uniqid",
  "unique_id",
  "uniqueId",
  "uid",
  "user_id",
  "userId",
  "userid",
  "egov_uniqid",
  "egovUniqid",
  "egov_user_id",
  "egovUserId",
  "subject",
  "sub",
  "id",
] as const;

/**
 * Map eGov SSO partner profile JSON into typed sync fields when present.
 * Does not invent keys — only copies known aliases from dashboard checklist
 * (uniqid, name, birthdate, address, email, contact). Always keeps `raw`.
 */
export function mapSsoCitizenProfile(raw: PlatformJson): EgovSsoCitizenProfile {
  const root = unwrapProfileRoot(raw);
  const uniqid = pickScalar(root, ...UNIQID_KEYS) ?? pickScalar(raw, ...UNIQID_KEYS);
  const firstName = pickScalar(
    root,
    "first_name",
    "firstName",
    "given_name",
    "givenName",
  );
  const middleName = pickScalar(root, "middle_name", "middleName");
  const lastName = pickScalar(
    root,
    "last_name",
    "lastName",
    "family_name",
    "familyName",
    "surname",
  );
  const composed = [firstName, middleName, lastName].filter(Boolean).join(" ");
  const fullName =
    pickScalar(root, "name", "full_name", "fullName") ??
    (composed.length > 0 ? composed : undefined);
  const birthdate = pickScalar(
    root,
    "birthdate",
    "birth_date",
    "birthDate",
    "date_of_birth",
    "dateOfBirth",
  );
  const address = pickScalar(root, "address", "full_address", "fullAddress");
  const email = pickScalar(root, "email", "email_address", "emailAddress");
  const contactNumber = pickScalar(
    root,
    "contact_number",
    "contactNumber",
    "mobile",
    "phone",
    "phone_number",
    "phoneNumber",
  );

  return {
    raw,
    ...(uniqid !== undefined ? { uniqid } : {}),
    ...(fullName !== undefined && fullName.length > 0 ? { fullName } : {}),
    ...(firstName !== undefined ? { firstName } : {}),
    ...(middleName !== undefined ? { middleName } : {}),
    ...(lastName !== undefined ? { lastName } : {}),
    ...(birthdate !== undefined ? { birthdate } : {}),
    ...(address !== undefined ? { address } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(contactNumber !== undefined ? { contactNumber } : {}),
  };
}
