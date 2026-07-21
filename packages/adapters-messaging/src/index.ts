import type { EventBus } from "@egov/application";
import type { DomainEvent } from "@egov/domain";
import { ok } from "@egov/shared";

export type EventHandler = (event: DomainEvent) => void | Promise<void>;

export function createInMemoryEventBus(): EventBus & {
  subscribe(handler: EventHandler): () => void;
} {
  const handlers = new Set<EventHandler>();
  return {
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    async publish(event) {
      for (const handler of handlers) {
        await handler(event);
      }
      return ok(undefined);
    },
  };
}
