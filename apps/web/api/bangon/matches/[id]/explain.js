const DEFAULT_BASE_URL = "https://egov-ai-core-ws.oueg.info";

function json(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

export default async function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed" });
  const accessCode = process.env.EGOV_AI_ACCESS_CODE?.trim();
  if (!accessCode) return json(response, 503, { error: "eGov AI is not configured" });
  const baseUrl = (process.env.EGOV_AI_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
  try {
    const tokenResponse = await fetch(`${baseUrl}/api/v1/egov/integration/token`, {
      method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ access_code: accessCode }),
    });
    const tokenBody = await tokenResponse.json().catch(() => ({}));
    const token = typeof tokenBody.access_token === "string" ? tokenBody.access_token : "";
    if (!tokenResponse.ok || !token) return json(response, 502, { error: "eGov AI authentication failed" });
    const aiResponse = await fetch(`${baseUrl}/api/v1/egov/integration/ai_assistant/generate`, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt: "Explain in plain Filipino that benefit eligibility is a preliminary hackathon-demo result based on verified identity attributes and must be confirmed by the responsible agency.", category: "PH" }),
    });
    const aiBody = await aiResponse.json().catch(() => ({}));
    const explanation = typeof aiBody.data === "string" ? aiBody.data.trim() : "";
    if (!aiResponse.ok || !explanation) return json(response, 502, { error: "eGov AI could not generate an explanation" });
    console.info(JSON.stringify({ event: "egov_ai_explanation_generated" }));
    return json(response, 200, { explanation });
  } catch (cause) {
    console.error(JSON.stringify({ event: "egov_ai_transport_failed", message: cause instanceof Error ? cause.message : "unknown" }));
    return json(response, 502, { error: "eGov AI is unavailable" });
  }
}
