import type { EgovSsoCitizenProfile, PlatformJson } from "../ports/index.js";

function pickString(
  obj: PlatformJson,
  ...keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function unwrapProfileRoot(raw: PlatformJson): PlatformJson {
  const data = raw.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as PlatformJson;
  }
  const user = raw.user;
  if (user && typeof user === "object" && !Array.isArray(user)) {
    return user as PlatformJson;
  }
  const profile = raw.profile;
  if (profile && typeof profile === "object" && !Array.isArray(profile)) {
    return profile as PlatformJson;
  }
  return raw;
}

/**
 * Map eGov SSO partner profile JSON into typed sync fields when present.
 * Does not invent keys — only copies known aliases from dashboard checklist
 * (uniqid, name, birthdate, address, email, contact). Always keeps `raw`.
 */
export function mapSsoCitizenProfile(raw: PlatformJson): EgovSsoCitizenProfile {
  const root = unwrapProfileRoot(raw);
  const uniqid = pickString(root, "uniqid", "unique_id", "uniqueId", "uid");
  const firstName = pickString(
    root,
    "first_name",
    "firstName",
    "given_name",
    "givenName",
  );
  const middleName = pickString(root, "middle_name", "middleName");
  const lastName = pickString(
    root,
    "last_name",
    "lastName",
    "family_name",
    "familyName",
    "surname",
  );
  const composed = [firstName, middleName, lastName].filter(Boolean).join(" ");
  const fullName =
    pickString(root, "name", "full_name", "fullName") ??
    (composed.length > 0 ? composed : undefined);
  const birthdate = pickString(
    root,
    "birthdate",
    "birth_date",
    "birthDate",
    "date_of_birth",
    "dateOfBirth",
  );
  const address = pickString(root, "address", "full_address", "fullAddress");
  const email = pickString(root, "email", "email_address", "emailAddress");
  const contactNumber = pickString(
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
