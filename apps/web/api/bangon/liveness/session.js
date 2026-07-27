const DEFAULT_BASE_URL = "https://hackathon-face-liveness-api.e.gov.ph";
const ALLOWED_ACTIONS = new Set(["redirect", "post", "close"]);

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

/**
 * Starts a hosted Face Liveness capture without exposing the platform API key
 * to the browser. This is a Vercel Serverless Function.
 */
export default async function handler(request, response) {
  if (request.method !== "POST") {
    return json(response, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.FACE_LIVENESS_API_KEY?.trim();
  if (!apiKey) {
    return json(response, 503, { error: "Face Liveness is not configured" });
  }

  const requestedAction = request.body?.action;
  const action = typeof requestedAction === "string" ? requestedAction : "post";
  if (!ALLOWED_ACTIONS.has(action)) {
    return json(response, 400, { error: "Unsupported Face Liveness action" });
  }

  const callbackUrl = request.body?.callbackUrl;
  if (callbackUrl !== undefined && (typeof callbackUrl !== "string" || callbackUrl.length > 2048)) {
    return json(response, 400, { error: "Invalid callbackUrl" });
  }

  const body = { action };
  if (typeof callbackUrl === "string" && callbackUrl.trim()) body.callback_url = callbackUrl.trim();

  try {
    const baseUrl = (process.env.FACE_LIVENESS_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
    const upstream = await fetch(`${baseUrl}/v1/liveness/session`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });
    const envelope = await upstream.json().catch(() => ({}));
    const data = payloadRoot(envelope) || {};
    const token = typeof data.token === "string" ? data.token : "";
    const url = typeof data.url === "string" ? data.url : "";
    if (!upstream.ok || !token || !url) {
      return json(response, 502, { error: "Face Liveness session could not be created" });
    }
    return json(response, 200, { token, url });
  } catch {
    return json(response, 502, { error: "Face Liveness service is unavailable" });
  }
}
