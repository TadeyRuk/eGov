export default function handler(_request: unknown, response: any) {
  const clientId = process.env.EGOV_SSO_CLIENT_ID?.trim() || process.env.EGOV_SSO_PARTNER_CODE?.trim();
  if (!clientId) return response.status(503).json({ error: "SSO client ID is not configured" });
  response.setHeader("Cache-Control", "no-store");
  return response.status(200).json({ environment: "STAGING", clientId });
}
