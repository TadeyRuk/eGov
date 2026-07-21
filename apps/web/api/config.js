export default function handler(_request, response) {
  const clientId =
    process.env.EGOV_SSO_CLIENT_ID?.trim() ||
    process.env.EGOV_SSO_PARTNER_CODE?.trim();

  response.setHeader("Cache-Control", "no-store");
  if (!clientId) {
    return response.status(503).json({ error: "SSO client ID is not configured" });
  }

  return response.status(200).json({
    environment: process.env.EGOV_SSO_ENV?.trim().toUpperCase() || "STAGING",
    clientId,
  });
}
