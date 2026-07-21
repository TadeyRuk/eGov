import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isFundedFromDbmResult } from "./dbm-fund.js";

describe("isFundedFromDbmResult", () => {
  it("SAAODB dashboard: funded when cascade.allotments > 0", () => {
    assert.equal(
      isFundedFromDbmResult("SAAODB", {
        cascade: { allotments: 1000, unobligated: 0 },
      }),
      true,
    );
  });

  it("SAAODB dashboard: unfunded when cascade allotments and unobligated are 0", () => {
    assert.equal(
      isFundedFromDbmResult("SAAODB", {
        cascade: { allotments: 0, unobligated: 0 },
      }),
      false,
    );
  });

  it("SAAODB records: funded when total > 0", () => {
    assert.equal(
      isFundedFromDbmResult("SAAODB", { total: 3, data: [] }),
      true,
    );
  });

  it("NCA: funded when data non-empty", () => {
    assert.equal(
      isFundedFromDbmResult("NCA", { data: [{ id: 1 }], total: 0 }),
      true,
    );
  });

  it("SARO: unfunded when empty", () => {
    assert.equal(isFundedFromDbmResult("SARO", { data: [], total: 0 }), false);
  });

  it("LGSF: funded when total string > 0", () => {
    assert.equal(
      isFundedFromDbmResult("LGSF", { total: "12", data: [] }),
      true,
    );
  });
});
