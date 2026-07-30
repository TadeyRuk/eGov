import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapSsoCitizenProfile } from "./sso-profile.js";

describe("mapSsoCitizenProfile", () => {
  it("maps flat checklist fields", () => {
    const profile = mapSsoCitizenProfile({
      uniqid: "u-1",
      first_name: "Juan",
      last_name: "Dela Cruz",
      birthdate: "1989-09-12",
      address: "Manila",
      email: "juan@example.com",
      contact_number: "+639171234567",
    });
    assert.equal(profile.uniqid, "u-1");
    assert.equal(profile.firstName, "Juan");
    assert.equal(profile.lastName, "Dela Cruz");
    assert.equal(profile.fullName, "Juan Dela Cruz");
    assert.equal(profile.birthdate, "1989-09-12");
    assert.equal(profile.email, "juan@example.com");
    assert.equal(profile.contactNumber, "+639171234567");
    assert.equal(profile.raw.uniqid, "u-1");
  });

  it("unwraps nested data object", () => {
    const profile = mapSsoCitizenProfile({
      data: { uniqueId: "x", name: "Josie" },
    });
    assert.equal(profile.uniqid, "x");
    assert.equal(profile.fullName, "Josie");
  });

  it("accepts numeric id aliases and nested data.user", () => {
    const profile = mapSsoCitizenProfile({
      status: "ok",
      data: { user: { id: 42, first_name: "Ana", last_name: "Reyes", birth_date: "1990-01-02" } },
    });
    assert.equal(profile.uniqid, "42");
    assert.equal(profile.firstName, "Ana");
    assert.equal(profile.lastName, "Reyes");
    assert.equal(profile.birthdate, "1990-01-02");
  });
});
