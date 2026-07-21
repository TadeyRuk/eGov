import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mapLgsfProjectRow,
  statusFromUtilization,
  utilizationFromAmounts,
} from "./dbm-transparency.js";

describe("utilizationFromAmounts", () => {
  it("uses NCA / SARO when SARO is present", () => {
    assert.equal(
      utilizationFromAmounts({ amountSaro: 100, amountNca: 72, amountTotal: 100 }),
      72,
    );
  });

  it("falls back to amountTotal when SARO is missing", () => {
    assert.equal(
      utilizationFromAmounts({ amountSaro: 0, amountNca: 0, amountTotal: 10_000_000 }),
      0,
    );
  });

  it("caps at 100", () => {
    assert.equal(
      utilizationFromAmounts({ amountSaro: 50, amountNca: 80, amountTotal: 50 }),
      100,
    );
  });
});

describe("statusFromUtilization", () => {
  it("maps fully released funds to Tapos na", () => {
    assert.deepEqual(statusFromUtilization(100), {
      status: "Tapos na",
      statusColor: "#16A34A",
    });
  });

  it("maps zero release to Naantala", () => {
    assert.deepEqual(statusFromUtilization(0), {
      status: "Naantala",
      statusColor: "#B91C1C",
    });
  });

  it("maps partial release to Ongoing", () => {
    assert.deepEqual(statusFromUtilization(72), {
      status: "Ongoing",
      statusColor: "#2563EB",
    });
  });
});

describe("mapLgsfProjectRow", () => {
  it("maps a live FALGU-shaped row", () => {
    const project = mapLgsfProjectRow({
      programCode: "FALGU",
      fiscalYear: 2026,
      region: "IV-A",
      province: "Batangas",
      cityMunicipality: "Lipa",
      barangay: null,
      projectName: "Construction of Multipurpose buildings",
      amountSaro: 500_000_000,
      amountNca: 500_000_000,
      amountTotal: 500_000_000,
    });

    assert.ok(project);
    assert.equal(project.title, "Construction of Multipurpose buildings");
    assert.equal(project.agency, "FALGU");
    assert.equal(project.location, "Lipa, Batangas, IV-A");
    assert.equal(project.utilization, 100);
    assert.equal(project.status, "Tapos na");
    assert.equal(project.statusColor, "#16A34A");
  });

  it("maps SBDP rows with null SARO/NCA as Naantala", () => {
    const project = mapLgsfProjectRow({
      programCode: "SBDP",
      fiscalYear: 2026,
      region: "CAR",
      province: "IFUGAO",
      cityMunicipality: "LAMUT",
      barangay: "AMBASA",
      projectName: "UPGRADING OF FARM TO MARKET ROAD",
      amountSaro: null,
      amountNca: null,
      amountTotal: 10_000_000,
    });

    assert.ok(project);
    assert.equal(project.utilization, 0);
    assert.equal(project.status, "Naantala");
    assert.equal(project.location, "AMBASA, LAMUT, IFUGAO, CAR");
  });

  it("returns null without a project name", () => {
    assert.equal(mapLgsfProjectRow({ programCode: "FALGU" }), null);
  });
});
