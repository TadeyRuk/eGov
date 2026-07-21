import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ok, err, appError } from "@egov/shared";
import type { EgovSsoPort } from "../ports/index.js";
import { exchangeSsoToken, getSsoCitizenProfile } from "./auth.js";

describe("SSO auth use cases", () => {
  it("exchangeSsoToken forwards exchangeCode and scope", async () => {
    const calls: unknown[] = [];
    const sso: EgovSsoPort = {
      async exchangeToken(input) {
        calls.push(input);
        return ok({
          accessToken: "tok_abc",
          tokenType: "Bearer",
          expiresIn: 60,
          raw: { access_token: "tok_abc" },
        });
      },
      async authenticatePartner() {
        return err(appError("INTERNAL", "unused"));
      },
    };
    const result = await exchangeSsoToken(
      { sso },
      { exchangeCode: "code_1", scope: "SSO_AUTHENTICATION" },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.accessToken, "tok_abc");
    assert.deepEqual(calls[0], {
      exchangeCode: "code_1",
      scope: "SSO_AUTHENTICATION",
    });
  });

  it("exchangeSsoToken defaults scope to SSO_AUTHENTICATION", async () => {
    const calls: unknown[] = [];
    const sso: EgovSsoPort = {
      async exchangeToken(input) {
        calls.push(input);
        return ok({
          accessToken: "tok_def",
          raw: { access_token: "tok_def" },
        });
      },
      async authenticatePartner() {
        return err(appError("INTERNAL", "unused"));
      },
    };
    const result = await exchangeSsoToken({ sso }, { exchangeCode: "code_2" });
    assert.equal(result.ok, true);
    assert.deepEqual(calls[0], {
      exchangeCode: "code_2",
      scope: "SSO_AUTHENTICATION",
    });
  });

  it("getSsoCitizenProfile returns raw profile", async () => {
    const sso: EgovSsoPort = {
      async exchangeToken() {
        return err(appError("INTERNAL", "unused"));
      },
      async authenticatePartner(accessToken) {
        assert.equal(accessToken, "tok_abc");
        return ok({ raw: { sub: "citizen-1" } });
      },
    };
    const result = await getSsoCitizenProfile(
      { sso },
      { accessToken: "tok_abc" },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.value.raw, { sub: "citizen-1" });
  });

  it("propagates SSO adapter failure", async () => {
    const sso: EgovSsoPort = {
      async exchangeToken() {
        return err(appError("UNAVAILABLE", "sso down"));
      },
      async authenticatePartner() {
        return err(appError("UNAVAILABLE", "sso down"));
      },
    };
    const exchanged = await exchangeSsoToken(
      { sso },
      { exchangeCode: "x", scope: "y" },
    );
    assert.equal(exchanged.ok, false);
    if (exchanged.ok) return;
    assert.equal(exchanged.error.code, "UNAVAILABLE");
  });
});
