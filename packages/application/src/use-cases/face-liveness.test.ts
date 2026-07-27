import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ok, err, appError } from "@egov/shared";
import type { FaceLivenessPort } from "../ports/index.js";
import {
  getFaceLivenessResult,
  startFaceLivenessSession,
} from "./face-liveness.js";

describe("Face Liveness use cases", () => {
  it("startFaceLivenessSession requires callbackUrl for redirect", async () => {
    const faceLiveness: FaceLivenessPort = {
      async createSession() {
        throw new Error("should not call platform");
      },
      async getResult() {
        throw new Error("unused");
      },
    };
    const result = await startFaceLivenessSession(
      { faceLiveness },
      { action: "redirect" },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "VALIDATION");
  });

  it("startFaceLivenessSession forwards close action", async () => {
    const faceLiveness: FaceLivenessPort = {
      async createSession(input) {
        assert.equal(input.action, "close");
        return ok({
          token: "tok_live",
          url: "https://example.test/capture",
          raw: {},
        });
      },
      async getResult() {
        throw new Error("unused");
      },
    };
    const result = await startFaceLivenessSession(
      { faceLiveness },
      { action: "close", delay: 3000 },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.token, "tok_live");
    assert.ok(result.value.url.includes("capture"));
  });

  it("getFaceLivenessResult rejects empty token", async () => {
    const faceLiveness: FaceLivenessPort = {
      async createSession() {
        throw new Error("unused");
      },
      async getResult() {
        throw new Error("should not call");
      },
    };
    const result = await getFaceLivenessResult(
      { faceLiveness },
      { sessionToken: "  " },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "VALIDATION");
  });

  it("getFaceLivenessResult rejects debug skip placeholders", async () => {
    const faceLiveness: FaceLivenessPort = {
      async createSession() {
        throw new Error("unused");
      },
      async getResult() {
        throw new Error("should not call platform");
      },
    };
    const result = await getFaceLivenessResult(
      { faceLiveness },
      { sessionToken: "skip-liveness-session" },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "VALIDATION");
    assert.match(result.error.message, /skip placeholder/i);
  });

  it("getFaceLivenessResult propagates adapter errors", async () => {
    const faceLiveness: FaceLivenessPort = {
      async createSession() {
        throw new Error("unused");
      },
      async getResult() {
        return err(appError("NOT_FOUND", "session missing"));
      },
    };
    const result = await getFaceLivenessResult(
      { faceLiveness },
      { sessionToken: "tok" },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "NOT_FOUND");
  });
});
