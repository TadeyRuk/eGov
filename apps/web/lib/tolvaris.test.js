import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { ledgerIdentity, profileRoot } from "./tolvaris.js";

const originalSecret = process.env.TOLVARIS_OWNER_HMAC_SECRET;

before(() => {
  process.env.TOLVARIS_OWNER_HMAC_SECRET = "test-only-secret";
});

after(() => {
  if (originalSecret === undefined) delete process.env.TOLVARIS_OWNER_HMAC_SECRET;
  else process.env.TOLVARIS_OWNER_HMAC_SECRET = originalSecret;
});

test("profileRoot unwraps an eGov profile envelope", () => {
  const profile = { uniqid: "citizen-001" };
  assert.deepEqual(profileRoot({ data: profile }), profile);
});

test("ledgerIdentity pseudonymizes the owner and exposes only card type codes", () => {
  const rawCardNumber = "1234-5678-9012";
  const identity = ledgerIdentity({
    uniqid: "citizen-001",
    first_name: "Sample",
    last_name: "Citizen",
    national_id: { number: rawCardNumber },
    tin_id: {},
  });

  assert.match(identity.ownerCommitment, /^0x[0-9a-f]{64}$/);
  assert.deepEqual(identity.detectedCards.map((card) => card.cardType), ["NATIONAL_ID"]);
  assert.match(identity.detectedCards[0].cardFingerprint, /^0x[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(identity).includes("Sample"), false);
  assert.equal(JSON.stringify(identity).includes(rawCardNumber), false);
});

test("ledgerIdentity is deterministic and changes between users", () => {
  const card = { number: "same-card-input" };
  const first = ledgerIdentity({ uniqid: "citizen-001", national_id: card });
  const repeated = ledgerIdentity({ uniqid: "citizen-001", national_id: card });
  const second = ledgerIdentity({ uniqid: "citizen-002", national_id: card });

  assert.deepEqual(repeated, first);
  assert.notEqual(second.ownerCommitment, first.ownerCommitment);
  assert.notEqual(second.detectedCards[0].cardFingerprint, first.detectedCards[0].cardFingerprint);
});
