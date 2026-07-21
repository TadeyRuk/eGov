import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, it } from "node:test";
import { verifyAgencyRequest } from "./tolvaris-agency-api.js";

const pair = generateKeyPairSync("ed25519");
const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
const timestamp = "2026-07-22T12:00:00.000Z";
const now = Date.parse(timestamp);
const rawBody = '{"agencyCode":"DBM","title":"Sample"}';

function headers(nonce: string, body = rawBody) {
  const bodyHash = createHash("sha256").update(body).digest("hex");
  const message = [timestamp, nonce, "POST", "/tolvaris/projects", bodyHash].join("\n");
  return {
    keyId: "dbm-test",
    timestamp,
    nonce,
    signature: sign(null, Buffer.from(message), pair.privateKey).toString("base64"),
  };
}

describe("Tolvaris agency request signatures", () => {
  it("accepts a valid Ed25519 signature", async () => {
    const result = verifyAgencyRequest({
      method: "POST",
      path: "/tolvaris/projects",
      rawBody,
      headers: headers("valid_nonce_0001"),
      agencyKeys: { "dbm-test": { agencyCode: "DBM", publicKeyPem } },
      now,
      consumeNonce: false,
    });
    assert.equal(result.ok, true);
  });

  it("rejects a signature when the body was changed", async () => {
    const result = verifyAgencyRequest({
      method: "POST",
      path: "/tolvaris/projects",
      rawBody: `${rawBody} `,
      headers: headers("changed_body_001"),
      agencyKeys: { "dbm-test": { agencyCode: "DBM", publicKeyPem } },
      now,
      consumeNonce: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 401);
  });

  it("rejects stale signed requests", async () => {
    const result = verifyAgencyRequest({
      method: "POST",
      path: "/tolvaris/projects",
      rawBody,
      headers: headers("stale_nonce_0001"),
      agencyKeys: { "dbm-test": { agencyCode: "DBM", publicKeyPem } },
      now: now + 10 * 60 * 1_000,
      consumeNonce: false,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 401);
  });
});
