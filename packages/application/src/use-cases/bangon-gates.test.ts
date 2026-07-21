import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ok, err, appError, newId } from "@egov/shared";
import type {
  AgentTask,
  CitizenEligibilityProfile,
  ServiceCase,
} from "@egov/domain";
import {
  attachDocument,
  confirmCitizenIdentity,
  dispatchAgentTask,
  runAgentTurn,
  type AgentMailbox,
  type AgentTaskRepository,
  type Clock,
  type DocumentStore,
  type EventBus,
  type EVerifyPort,
  type LlmPort,
  type ServiceCaseRepository,
} from "../index.js";

const clock: Clock = { now: () => new Date("2026-07-21T12:00:00.000Z") };

describe("attachDocument", () => {
  it("stores a document when the case exists", async () => {
    const caseId = newId<"ServiceCaseId">("case");
    const cases: ServiceCaseRepository = {
      async getById(id) {
        if (id !== caseId) return err(appError("NOT_FOUND", "missing"));
        const c: ServiceCase = {
          id: caseId,
          citizenId: newId<"CitizenId">("citizen"),
          title: "t",
          status: "submitted",
          createdAt: clock.now(),
          updatedAt: clock.now(),
        };
        return ok(c);
      },
      async save(c) {
        return ok(c);
      },
    };
    const documents: DocumentStore = {
      async save(document) {
        return ok(document);
      },
      async get() {
        return err(appError("NOT_FOUND", "unused"));
      },
    };
    const result = await attachDocument(
      { cases, documents, clock },
      {
        caseId,
        fileName: "a.pdf",
        contentType: "application/pdf",
        content: new Uint8Array([9]),
      },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.caseId, caseId);
    assert.equal(result.value.fileName, "a.pdf");
  });

  it("fails when the case does not exist", async () => {
    const cases: ServiceCaseRepository = {
      async getById() {
        return err(appError("NOT_FOUND", "no case"));
      },
      async save(c) {
        return ok(c);
      },
    };
    const documents: DocumentStore = {
      async save() {
        throw new Error("should not store");
      },
      async get() {
        return err(appError("NOT_FOUND", "unused"));
      },
    };
    const result = await attachDocument(
      { cases, documents, clock },
      {
        caseId: newId<"ServiceCaseId">("case"),
        fileName: "a.pdf",
        contentType: "application/pdf",
        content: new Uint8Array([9]),
      },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "NOT_FOUND");
  });
});

describe("confirmCitizenIdentity Face Liveness gate", () => {
  const eVerify: EVerifyPort = {
    async authenticate() {
      return ok({ token: "tok", raw: {} });
    },
    async verifyPersonalInfo() {
      return ok({
        raw: {
          date_of_birth: "1950-01-01",
          civil_status: "widowed",
          vital_status: "alive",
        },
      });
    },
    async checkQr() {
      return ok({ raw: {} });
    },
    async verifyQr() {
      return ok({ raw: {} });
    },
  };

  it("rejects when liveness did not pass", async () => {
    const result = await confirmCitizenIdentity(
      { eVerify },
      {
        token: "t",
        payload: {},
        liveness: {
          status: "FAILED",
          confidence: 99,
          passed: false,
          raw: {},
        },
      },
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.error.code, "FORBIDDEN");
  });

  it("returns profile when liveness passed", async () => {
    const result = await confirmCitizenIdentity(
      { eVerify },
      {
        token: "t",
        payload: {},
        liveness: {
          status: "SUCCEEDED",
          confidence: 97.5,
          passed: true,
          raw: {},
        },
      },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const profile: CitizenEligibilityProfile = result.value;
    assert.equal(profile.civilStatus, "widowed");
    assert.equal(profile.vitalStatus, "alive");
  });
});

describe("runAgentTurn needs_human on LLM failure", () => {
  it("persists needs_human when the LLM fails", async () => {
    const store = new Map<string, AgentTask>();
    const tasks: AgentTaskRepository = {
      async getById(id) {
        const found = store.get(id);
        return found
          ? ok(found)
          : err(appError("NOT_FOUND", `task ${id} missing`));
      },
      async save(task) {
        store.set(task.id, task);
        return ok(task);
      },
      async listByCorrelation(correlationId) {
        return ok(
          [...store.values()].filter((t) => t.correlationId === correlationId),
        );
      },
    };

    const queue: Array<{
      from: AgentTask["owner"];
      to: AgentTask["owner"] | "broadcast";
      stage: AgentTask["stage"];
      correlationId: string;
      payload: string;
    }> = [];

    const retainingMailbox: AgentMailbox = {
      async send(input) {
        queue.push(input);
        return ok({
          ...input,
          id: newId("msg"),
          createdAt: clock.now(),
        });
      },
      async receive(role) {
        const idx = queue.findIndex((m) => m.to === role);
        if (idx < 0) return ok(null);
        const [next] = queue.splice(idx, 1);
        if (!next) return ok(null);
        return ok({
          ...next,
          id: newId("msg"),
          createdAt: clock.now(),
        });
      },
    };

    const events: EventBus = {
      async publish() {
        return ok(undefined);
      },
    };
    const llm: LlmPort = {
      async complete() {
        return err(appError("UNAVAILABLE", "down"));
      },
    };

    const dispatched = await dispatchAgentTask(
      { tasks, mailbox: retainingMailbox, clock },
      {
        stage: "build",
        summary: "implement feature",
        correlationId: newId("corr"),
      },
    );
    assert.equal(dispatched.ok, true);
    if (!dispatched.ok) return;

    const turn = await runAgentTurn(
      { tasks, mailbox: retainingMailbox, llm, events, clock },
      "builder",
    );
    assert.equal(turn.ok, false);

    const updated = await tasks.getById(dispatched.value.id);
    assert.equal(updated.ok, true);
    if (!updated.ok) return;
    assert.equal(updated.value.status, "needs_human");
  });
});
