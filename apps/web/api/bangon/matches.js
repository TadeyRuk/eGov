function json(response, status, body) {
  response.setHeader("Cache-Control", "no-store");
  return response.status(status).json(body);
}

function ageOn(dateOfBirth, today = new Date()) {
  let age = today.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const month = today.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (month < 0 || (month === 0 && today.getUTCDate() < dateOfBirth.getUTCDate())) age -= 1;
  return age;
}

function normalized(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

/**
 * Hackathon demo eligibility rules mirrored from the BANGON UI. This route
 * deliberately returns only generated match ids and benefit ids; it does not
 * persist personal data or represent a production agency adjudication.
 */
export default function handler(request, response) {
  if (request.method !== "POST") return json(response, 405, { error: "Method not allowed" });

  const citizenId = typeof request.body?.citizenId === "string" ? request.body.citizenId.trim() : "";
  const profile = request.body?.profile && typeof request.body.profile === "object" ? request.body.profile : {};
  const dateText = typeof profile.dateOfBirth === "string" ? profile.dateOfBirth.trim() : "";
  const dateOfBirth = /^\d{4}-\d{2}-\d{2}$/.test(dateText) ? new Date(`${dateText}T00:00:00.000Z`) : null;
  if (!citizenId || !dateOfBirth || Number.isNaN(dateOfBirth.getTime())) {
    return json(response, 400, { error: "A citizen id and valid date of birth are required" });
  }

  const civilStatus = normalized(profile.civilStatus);
  const vitalStatus = normalized(profile.vitalStatus);
  const isLive = vitalStatus === "ALIVE" || vitalStatus === "BUHAY";
  if (!isLive) return json(response, 200, []);

  const matches = [];
  if (ageOn(dateOfBirth) >= 60) {
    matches.push({ id: crypto.randomUUID(), benefitId: "sss" });
    matches.push({ id: crypto.randomUUID(), benefitId: "philhealth" });
  }
  if (["WIDOWED", "BALO", "WIDOW", "WIDOWER"].includes(civilStatus)) {
    matches.push({ id: crypto.randomUUID(), benefitId: "dswd" });
  }
  console.info(JSON.stringify({ event: "bangon_matches_evaluated", count: matches.length }));
  return json(response, 200, matches);
}
