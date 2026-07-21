import type { AgentMailbox, AgentMessage, LlmPort } from "@egov/application";
import type { AgentRole } from "@egov/domain";
import { appError, err, newId, ok } from "@egov/shared";

export type StubLlmOptions = {
  readonly reply?: (messages: Parameters<LlmPort["complete"]>[0]) => string;
};

/** Deterministic stub LLM — replace with Ollama/gateway adapter later. */
export function createStubLlmPort(options: StubLlmOptions = {}): LlmPort {
  return {
    async complete(messages) {
      const last = messages[messages.length - 1]?.content ?? "";
      const content =
        options.reply?.(messages) ??
        `[stub-llm] acknowledged: ${last.slice(0, 240)}`;
      return ok({ content });
    },
  };
}

export function createUnavailableLlmPort(): LlmPort {
  return {
    async complete() {
      return err(appError("UNAVAILABLE", "LLM provider unavailable"));
    },
  };
}

export function createInMemoryAgentMailbox(clock: {
  now(): Date;
}): AgentMailbox {
  const queues = new Map<AgentRole | "broadcast", AgentMessage[]>();

  const enqueue = (key: AgentRole | "broadcast", message: AgentMessage) => {
    const list = queues.get(key) ?? [];
    list.push(message);
    queues.set(key, list);
  };

  return {
    async send(input) {
      const message: AgentMessage = {
        ...input,
        id: newId("msg"),
        createdAt: clock.now(),
      };
      if (message.to === "broadcast") {
        enqueue("broadcast", message);
      } else {
        enqueue(message.to, message);
      }
      return ok(message);
    },
    async receive(role) {
      const personal = queues.get(role) ?? [];
      const next = personal.shift();
      if (next) {
        queues.set(role, personal);
        return ok(next);
      }
      const broadcast = queues.get("broadcast") ?? [];
      const shared = broadcast.shift();
      if (shared) {
        queues.set("broadcast", broadcast);
        return ok(shared);
      }
      return ok(null);
    },
  };
}
