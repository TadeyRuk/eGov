import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { hmacSha256Hex } from "./http.js";
import { eGovPayDigestKeyFromToken } from "./egov-pay.js";

describe("eGovPay HMAC digest ($amount|$txnid)", () => {
  it("matches Node crypto HMAC-SHA256 hex of amount|txnid", async () => {
    const token = "test_deadbeef";
    const amount = 1000;
    const txnid = "bangon-txn-001";
    const message = `${amount}|${txnid}`;
    const expected = createHmac("sha256", token).update(message).digest("hex");
    const actual = await hmacSha256Hex(token, message);
    assert.equal(actual, expected);
  });

  it("differs when amount or txnid changes", async () => {
    const token = "test_deadbeef";
    const a = await hmacSha256Hex(token, "1000|txn-a");
    const b = await hmacSha256Hex(token, "1001|txn-a");
    const c = await hmacSha256Hex(token, "1000|txn-b");
    assert.notEqual(a, b);
    assert.notEqual(a, c);
  });
});

describe("eGovPayDigestKeyFromToken", () => {
  it("strips a test_ prefix (live-verified against the dashboard's own tester)", () => {
    assert.equal(
      eGovPayDigestKeyFromToken("test_deadbeef"),
      "deadbeef",
    );
  });

  it("leaves non-test_ keys unchanged", () => {
    assert.equal(eGovPayDigestKeyFromToken("deadbeef"), "deadbeef");
  });

  it("only strips a leading test_, not one elsewhere in the string", () => {
    assert.equal(
      eGovPayDigestKeyFromToken("live_test_deadbeef"),
      "live_test_deadbeef",
    );
  });
});
