import {
  anchorDetectedCards,
  ledgerIdentity,
  profileRoot,
  readLedgerCards,
} from "../../../lib/tolvaris.js";

function json(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function accessTokenFrom(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "";
  const nested = body.data;
  const nestedToken =
    nested && typeof nested === "object" && !Array.isArray(nested)
      ? nested.access_token
      : undefined;
  return typeof body.access_token === "string"
    ? body.access_token
    : typeof nestedToken === "string"
      ? nestedToken
      : "";
}

function minimumProfile(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return {};
  const root =
    envelope.data && typeof envelope.data === "object" && !Array.isArray(envelope.data)
      ? envelope.data
      : envelope;
  const allowed = ["uniqid", "email", "first_name", "middle_name", "last_name", "mobile"];
  return Object.fromEntries(
    allowed.flatMap((key) => root[key] === undefined ? [] : [[key, root[key]]]),
  );
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    return json(response, 405, { error: "Method not allowed" });
  }

  const code = typeof request.body?.code === "string" ? request.body.code.trim() : "";
  if (!code) return json(response, 400, { error: "code is required" });

  const base = process.env.EGOV_SSO_BASE_URL?.trim();
  const partnerCode = process.env.EGOV_SSO_PARTNER_CODE?.trim();
  const partnerSecret = process.env.EGOV_SSO_PARTNER_SECRET?.trim();
  if (!base || !partnerCode || !partnerSecret) {
    return json(response, 503, { error: "SSO backend is not configured" });
  }

  try {
    const tokenResponse = await fetch(`${base}/api/token`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        exchange_code: code,
        scope: process.env.EGOV_SSO_SCOPE?.trim() || "SSO_AUTHENTICATION",
        partner_code: partnerCode,
        partner_secret: partnerSecret,
      }),
    });
    const tokenBody = await tokenResponse.json().catch(() => ({}));
    const accessToken = accessTokenFrom(tokenBody);
    if (!tokenResponse.ok || !accessToken) {
      return json(response, 401, { error: "eGov token exchange failed" });
    }

    const profileResponse = await fetch(`${base}/api/partner/sso_authentication`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${accessToken}`,
      },
    });
    const profileEnvelope = await profileResponse.json().catch(() => ({}));
    if (!profileResponse.ok) {
      return json(response, 401, { error: "eGov profile request failed" });
    }

    const root = profileRoot(profileEnvelope);
    const identity = ledgerIdentity(root);
    let ledger = {
      configured: false,
      ownerCommitment: identity?.ownerCommitment ?? null,
      detectedCards: identity?.detectedCards.map((card) => card.cardType) ?? [],
      cards: [],
      submitted: [],
    };
    if (identity) {
      try {
        const anchored = request.body?.anchorCards === true
          ? await anchorDetectedCards(identity)
          : { configured: true, submitted: [] };
        const stored = await readLedgerCards(identity.ownerCommitment);
        ledger = {
          ...ledger,
          configured: anchored.configured && stored.configured,
          cards: stored.cards,
          submitted: anchored.submitted,
        };
      } catch {
        ledger.error = "Tolvaris ledger is temporarily unavailable";
      }
    }

    return json(response, 200, {
      authenticated: true,
      profile: minimumProfile(profileEnvelope),
      ledger,
    });
  } catch {
    return json(response, 502, { error: "eGov SSO is temporarily unavailable" });
  }
}
