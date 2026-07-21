import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInMemoryPersistence } from "./index.js";
import { createId, newId } from "@egov/shared";
import type {
  BenefitId,
  BenefitMatch,
  Citizen,
  ServiceCase,
} from "@egov/domain";

describe("in-memory repository ports (contract)", () => {
  const clock = () => new Date("2026-07-21T00:00:00.000Z");

  it("CitizenRepository: save then getById round-trips", async () => {
    const { citizens } = createInMemoryPersistence();
    const citizen: Citizen = {
      id: newId<"CitizenId">("citizen"),
      displayName: "Juan Dela Cruz",
      createdAt: clock(),
    };
    const saved = await citizens.save(citizen);
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    const got = await citizens.getById(saved.value.id);
    assert.equal(got.ok, true);
    if (!got.ok) return;
    assert.deepEqual(got.value, citizen);
  });

  it("CitizenRepository: missing id returns NOT_FOUND", async () => {
    const { citizens } = createInMemoryPersistence();
    const got = await citizens.getById(
      createId<"CitizenId">("citizen_missing"),
    );
    assert.equal(got.ok, false);
    if (got.ok) return;
    assert.equal(got.error.code, "NOT_FOUND");
  });

  it("ServiceCaseRepository: save then getById round-trips", async () => {
    const { cases } = createInMemoryPersistence();
    const serviceCase: ServiceCase = {
      id: newId<"ServiceCaseId">("case"),
      citizenId: newId<"CitizenId">("citizen"),
      title: "Test case",
      status: "submitted",
      createdAt: clock(),
      updatedAt: clock(),
    };
    const saved = await cases.save(serviceCase);
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    const got = await cases.getById(saved.value.id);
    assert.equal(got.ok, true);
    if (!got.ok) return;
    assert.deepEqual(got.value, serviceCase);
  });

  it("DocumentStore: save then get round-trips bytes", async () => {
    const { documents } = createInMemoryPersistence();
    const document = {
      id: newId<"DocumentId">("doc"),
      caseId: newId<"ServiceCaseId">("case"),
      fileName: "id.png",
      contentType: "image/png",
      createdAt: clock(),
    };
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const saved = await documents.save(document, bytes);
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    const got = await documents.get(saved.value.id);
    assert.equal(got.ok, true);
    if (!got.ok) return;
    assert.deepEqual(got.value.document, document);
    assert.deepEqual(got.value.content, bytes);
  });

  it("AgentTaskRepository: listByCorrelation returns saved tasks", async () => {
    const { tasks } = createInMemoryPersistence();
    const correlationId = newId("corr");
    const task = {
      id: newId<"AgentTaskId">("task"),
      stage: "foundation" as const,
      owner: "architect" as const,
      status: "queued" as const,
      summary: "scaffold",
      correlationId,
      createdAt: clock(),
      updatedAt: clock(),
    };
    const saved = await tasks.save(task);
    assert.equal(saved.ok, true);
    const listed = await tasks.listByCorrelation(correlationId);
    assert.equal(listed.ok, true);
    if (!listed.ok) return;
    assert.equal(listed.value.length, 1);
    assert.equal(listed.value[0]?.id, task.id);
  });

  it("BenefitMatchRepository: save then getById round-trips", async () => {
    const { matches } = createInMemoryPersistence();
    const match: BenefitMatch = {
      id: newId<"BenefitMatchId">("match"),
      citizenId: newId<"CitizenId">("citizen"),
      benefitId: newId<"BenefitId">("benefit"),
      matchedAt: clock(),
    };
    const saved = await matches.save(match);
    assert.equal(saved.ok, true);
    if (!saved.ok) return;
    const got = await matches.getById(saved.value.id);
    assert.equal(got.ok, true);
    if (!got.ok) return;
    assert.deepEqual(got.value, match);
  });

  it("HashPort: sha256Hex is deterministic", async () => {
    const { hash } = createInMemoryPersistence();
    const a = await hash.sha256Hex("bangon");
    const b = await hash.sha256Hex("bangon");
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });
});
