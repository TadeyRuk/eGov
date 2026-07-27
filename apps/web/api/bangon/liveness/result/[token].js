const DEFAULT_BASE_URL = "https://hackathon-face-liveness-api.e.gov.ph";

function json(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function payloadRoot(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    value.data && typeof value.data === "object" && !Array.isArray(value.data)
    ? value.data
    : value;
}

/** Polls a capture result. The pass rule is intentionally enforced server-side. */
export default async function handler(request, response) {
  if (request.method !== "GET") {
    return json(response, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.FACE_LIVENESS_API_KEY?.trim();
  if (!apiKey) {
    return json(response, 503, { error: "Face Liveness is not configured" });
  }
  const token = typeof request.query?.token === "string" ? request.query.token.trim() : "";
  if (!token || token.length > 1024) {
    return json(response, 400, { error: "A valid session token is required" });
  }

  try {
    const baseUrl = (process.env.FACE_LIVENESS_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
    const upstream = await fetch(`${baseUrl}/v1/liveness/result/${encodeURIComponent(token)}`, {
      headers: { accept: "application/json", "x-api-key": apiKey },
    });
    const envelope = await upstream.json().catch(() => ({}));
    const data = payloadRoot(envelope) || {};
    if (!upstream.ok) {
      return json(response, 502, { error: "Face Liveness result is unavailable" });
    }
    const status = typeof data.status === "string" ? data.status : "PENDING";
    const rawConfidence = data.confidence_score;
    const confidence = typeof rawConfidence === "number"
      ? rawConfidence
      : typeof rawConfidence === "string" && rawConfidence.trim() ? Number(rawConfidence) : null;
    const normalizedConfidence = Number.isFinite(confidence) ? confidence : null;
    return json(response, 200, {
      status,
      confidence: normalizedConfidence,
      passed: status.toUpperCase() === "SUCCEEDED" && normalizedConfidence !== null && normalizedConfidence >= 95,
    });
  } catch {
    return json(response, 502, { error: "Face Liveness service is unavailable" });
  }
}
