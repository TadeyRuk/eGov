import { readLedgerCards } from "../lib/tolvaris.js";

export default async function handler(request, response) {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "GET") {
    return response.status(405).json({ error: "Method not allowed" });
  }
  const ownerCommitment =
    typeof request.query?.ownerCommitment === "string"
      ? request.query.ownerCommitment.trim()
      : "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(ownerCommitment)) {
    return response.status(400).json({ error: "Valid ownerCommitment is required" });
  }
  try {
    const ledger = await readLedgerCards(ownerCommitment);
    return response.status(200).json({ ownerCommitment, ...ledger });
  } catch {
    return response.status(502).json({ error: "Tolvaris ledger is temporarily unavailable" });
  }
}
