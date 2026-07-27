const DEFAULT_EVERIFY_BASE_URL = "https://hackathon-everify-api.e.gov.ph";

function json(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function root(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    value.data && typeof value.data === "object" && !Array.isArray(value.data)
    ? value.data
    : value;
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Server-side eVerify Tier verification. The browser supplies the SDK's
 * short-lived liveness session id and demographics; the client secret and
 * bearer token never leave Vercel.
 */
export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed" });

  const clientId = process.env.EVERIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.EVERIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return json(response, 503, { error: "eVerify backend is not configured" });
  }

  const faceLivenessSessionId = text(request.body?.faceLivenessSessionId);
  const firstName = text(request.body?.firstName);
  const lastName = text(request.body?.lastName);
  const birthDate = text(request.body?.birthDate);
  if (!faceLivenessSessionId || !firstName || !lastName || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
    return json(response, 400, { error: "Valid liveness session and demographics are required" });
  }

  const payload = {
    first_name: firstName,
    last_name: lastName,
    birth_date: birthDate,
    face_liveness_session_id: faceLivenessSessionId,
  };
  const middleName = text(request.body?.middleName);
  const suffix = text(request.body?.suffix);
  if (middleName) payload.middle_name = middleName;
  if (suffix) payload.suffix = suffix;

  const baseUrl = (process.env.EVERIFY_BASE_URL?.trim() || DEFAULT_EVERIFY_BASE_URL).replace(/\/$/, "");
  try {
    const authResponse = await fetch(`${baseUrl}/api/auth`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret }),
    });
    const authEnvelope = await authResponse.json().catch(() => ({}));
    const authData = root(authEnvelope) || {};
    const accessToken = text(authData.access_token) || text(authData.token) || text(authEnvelope.access_token);
    if (!authResponse.ok || !accessToken) {
      return json(response, 502, { error: "eVerify authentication failed" });
    }

    const verifyResponse = await fetch(`${baseUrl}/api/query`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const verifyEnvelope = await verifyResponse.json().catch(() => ({}));
    if (!verifyResponse.ok) {
      return json(response, verifyResponse.status === 401 || verifyResponse.status === 403 ? 403 : 422, {
        error: "eVerify could not confirm this identity",
      });
    }
    const verified = root(verifyEnvelope) || {};
    const dateOfBirth = text(verified.date_of_birth) || text(verified.dateOfBirth) || birthDate;
    return json(response, 200, {
      dateOfBirth,
      // The documented Tier II response calls this `marital_status`.
      civilStatus: text(verified.civil_status) || text(verified.civilStatus) || text(verified.marital_status),
      // A completed live-person capture establishes current presence for this
      // demo's eligibility gate; the eVerify response has no civil-registry
      // `vital_status` field.
      vitalStatus: text(verified.vital_status) || text(verified.vitalStatus) || "ALIVE",
    });
  } catch {
    return json(response, 502, { error: "eVerify service is unavailable" });
  }
}
