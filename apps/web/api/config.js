export default function handler(_request, response) {
  const clientId =
    process.env.EGOV_SSO_CLIENT_ID?.trim() ||
    process.env.EGOV_SSO_PARTNER_CODE?.trim();

  response.setHeader("Cache-Control", "no-store");
  if (!clientId) {
    return response.status(503).json({ error: "SSO client ID is not configured" });
  }

  return response.status(200).json({
    // Retained for the original static SSO test page.
    environment: process.env.EGOV_SSO_ENV?.trim().toUpperCase() || "STAGING",
    clientId,
    // Used by the BANGON React shell. Only browser-safe configuration belongs
    // here: never expose a partner secret or an API key.
    sso: {
      environment: process.env.EGOV_SSO_ENV?.trim().toUpperCase() || "STAGING",
      clientId,
    },
    eVerify: {
      publicKey: process.env.EVERIFY_PUBLIC_KEY?.trim() || "",
    },
  });
}
