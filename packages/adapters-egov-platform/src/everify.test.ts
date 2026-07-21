import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractEVerifyAccessToken } from "./everify.js";

describe("extractEVerifyAccessToken", () => {
  it("reads nested data.access_token (official shape)", () => {
    assert.equal(
      extractEVerifyAccessToken({
        data: {
          access_token: "eyJnested",
          token_type: "Bearer",
          expires_at: "1724223772",
        },
      }),
      "eyJnested",
    );
  });

  it("falls back to flat access_token", () => {
    assert.equal(
      extractEVerifyAccessToken({ access_token: "eyJflat" }),
      "eyJflat",
    );
  });

  it("returns empty string when missing", () => {
    assert.equal(extractEVerifyAccessToken({}), "");
  });
});
