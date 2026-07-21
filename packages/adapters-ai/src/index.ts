import type { AgentMailbox, AgentMessage, LlmPort } from "@egov/application";
import type { AgentRole } from "@egov/domain";
import { appError, err, newId, ok } from "@egov/shared";

export type StubLlmOptions = {
  readonly reply?: (messages: Parameters<LlmPort["complete"]>[0]) => string;
};

/** Deterministic stub LLM — use createOllamaLlmPort for a real provider. */
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

export type OllamaLlmOptions = {
  /** Default: http://127.0.0.1:11434 — pass from OLLAMA_BASE_URL at composition root. */
  readonly baseUrl?: string;
  /** Default: qwen3.5:4b — pass from OLLAMA_MODEL at composition root. */
  readonly model?: string;
  readonly fetch?: typeof fetch;
};

/** Real Ollama chat adapter behind LlmPort. Reachability is not assumed —
 * failures return Result err (UNAVAILABLE), never throw across the port. */
export function createOllamaLlmPort(options: OllamaLlmOptions = {}): LlmPort {
  const baseUrl = (options.baseUrl ?? "http://127.0.0.1:11434").replace(
    /\/$/,
    "",
  );
  const model = options.model ?? "qwen3.5:4b";
  const fetchFn = options.fetch ?? globalThis.fetch;

  return {
    async complete(messages) {
      try {
        const response = await fetchFn(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            stream: false,
            messages: messages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });
        if (!response.ok) {
          return err(
            appError(
              "UNAVAILABLE",
              `Ollama HTTP ${response.status} from ${baseUrl}`,
            ),
          );
        }
        const data = (await response.json()) as {
          message?: { content?: unknown };
        };
        const content = data.message?.content;
        if (typeof content !== "string") {
          return err(
            appError("UNAVAILABLE", "Ollama response missing message.content"),
          );
        }
        return ok({ content });
      } catch (cause) {
        return err(appError("UNAVAILABLE", "Ollama request failed", cause));
      }
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
