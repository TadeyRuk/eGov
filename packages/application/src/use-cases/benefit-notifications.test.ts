import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ok } from "@egov/shared";
import type {
  BenefitNotificationRecord,
  BenefitNotificationRepository,
  EMessagePort,
} from "../ports/index.js";
import { sendBenefitNotification } from "./benefit-notifications.js";

function harness(seed: BenefitNotificationRecord[] = []) {
  const records = [...seed];
  const messages: string[] = [];
  const notifications: BenefitNotificationRepository = {
    async hasContext(recipientDigest, contextDigest) {
      return ok(records.some((item) => item.recipientDigest === recipientDigest && item.contextDigest === contextDigest));
    },
    async listSince(recipientDigest, since) {
      return ok(records.filter((item) => item.recipientDigest === recipientDigest && item.sentAt >= since));
    },
    async save(record) {
      records.push(record);
      return ok(record);
    },
  };
  const eMessage: EMessagePort = {
    async pushSms(input) {
      messages.push(input.message);
      return ok({ raw: {} });
    },
  };
  return {
    deps: {
      notifications,
      eMessage,
      hash: { async sha256Hex(input: string) { return `digest:${input}`; } },
      clock: { now: () => new Date("2026-07-22T02:00:00.000Z") },
    },
    messages,
    records,
  };
}

const base = {
  citizenPhone: "+639000000000",
  recipientKey: "citizen-001",
  benefitTitle: "PhilHealth Senior Citizen Premium Subsidy",
};

describe("sendBenefitNotification", () => {
  it("sends contextual templates for every supported category", async () => {
    const { deps, messages } = harness();
    const inputs = [
      { ...base, category: "BENEFIT_ANNOUNCEMENT" as const, contextKey: "announcement-1" },
      { ...base, category: "QUALIFICATION_RESULT" as const, contextKey: "qualification-1" },
      { ...base, category: "REQUIREMENTS_NEEDED" as const, contextKey: "requirements-1", requirements: ["Valid ID", "MDR"] },
      { ...base, category: "APPLICATION_STATUS" as const, contextKey: "status-1", statusText: "Approved for processing" },
      { ...base, category: "ACTION_REMINDER" as const, contextKey: "reminder-1", actionText: "Submit your signed form", deadlineText: "31 July 2026" },
    ];
    for (const input of inputs) {
      const result = await sendBenefitNotification(deps, input);
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.value.status, "SENT");
    }
    assert.equal(messages.length, 5);
    assert.ok(messages.some((message) => message.includes("Valid ID, MDR")));
    assert.ok(messages.every((message) => !message.includes("http")));
  });

  it("suppresses an exact category/context duplicate", async () => {
    const { deps, messages } = harness();
    const input = { ...base, category: "QUALIFICATION_RESULT" as const, contextKey: "match-1" };
    const first = await sendBenefitNotification(deps, input);
    const second = await sendBenefitNotification(deps, input);
    assert.equal(first.ok && first.value.status, "SENT");
    assert.equal(second.ok && second.value.status, "SUPPRESSED_DUPLICATE");
    assert.equal(messages.length, 1);
  });

  it("suppresses a second same-category context during cooldown", async () => {
    const { deps, messages } = harness();
    await sendBenefitNotification(deps, { ...base, category: "APPLICATION_STATUS", contextKey: "status-v1", statusText: "Received" });
    const result = await sendBenefitNotification(deps, { ...base, category: "APPLICATION_STATUS", contextKey: "status-v2", statusText: "Under review" });
    assert.equal(result.ok && result.value.status, "SUPPRESSED_CATEGORY_COOLDOWN");
    assert.equal(messages.length, 1);
  });

  it("rejects a requirements notification without requirements", async () => {
    const { deps, messages } = harness();
    const result = await sendBenefitNotification(deps, {
      ...base,
      category: "REQUIREMENTS_NEEDED",
      contextKey: "requirements-empty",
    });
    assert.equal(result.ok, false);
    assert.equal(messages.length, 0);
  });

  it("caps total messages at five per recipient in 24 hours", async () => {
    const recipientDigest = "digest:EMESSAGE|RECIPIENT|citizen-001";
    const seed = Array.from({ length: 5 }, (_, index) => ({
      id: `notification-${index}`,
      recipientDigest,
      contextDigest: `old-context-${index}`,
      category: "BENEFIT_ANNOUNCEMENT" as const,
      sentAt: new Date("2026-07-22T01:00:00.000Z"),
    }));
    const { deps, messages } = harness(seed);
    const result = await sendBenefitNotification(deps, {
      ...base,
      category: "ACTION_REMINDER",
      contextKey: "sixth-message",
      actionText: "Submit the remaining form",
    });
    assert.equal(result.ok && result.value.status, "SUPPRESSED_DAILY_LIMIT");
    assert.equal(messages.length, 0);
  });
});
