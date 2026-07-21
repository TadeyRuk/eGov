import type {
  AgentTaskRepository,
  CitizenRepository,
  DocumentStore,
  ServiceCaseRepository,
} from "@egov/application";
import type {
  AgentTask,
  CaseDocument,
  Citizen,
  CitizenId,
  DocumentId,
  ServiceCase,
  ServiceCaseId,
} from "@egov/domain";
import { appError, err, ok, type Result } from "@egov/shared";

export function createInMemoryCitizenRepository(): CitizenRepository {
  const store = new Map<CitizenId, Citizen>();
  return {
    async getById(id) {
      const found = store.get(id);
      return found
        ? ok(found)
        : err(appError("NOT_FOUND", `Citizen ${id} not found`));
    },
    async save(citizen) {
      store.set(citizen.id, citizen);
      return ok(citizen);
    },
  };
}

export function createInMemoryServiceCaseRepository(): ServiceCaseRepository {
  const store = new Map<ServiceCaseId, ServiceCase>();
  return {
    async getById(id) {
      const found = store.get(id);
      return found
        ? ok(found)
        : err(appError("NOT_FOUND", `Service case ${id} not found`));
    },
    async save(serviceCase) {
      store.set(serviceCase.id, serviceCase);
      return ok(serviceCase);
    },
  };
}

export function createInMemoryDocumentStore(): DocumentStore {
  const meta = new Map<DocumentId, CaseDocument>();
  const blobs = new Map<DocumentId, Uint8Array>();
  return {
    async save(document, content) {
      meta.set(document.id, document);
      blobs.set(document.id, content);
      return ok(document);
    },
    async get(id) {
      const document = meta.get(id);
      const content = blobs.get(id);
      if (!document || !content) {
        return err(appError("NOT_FOUND", `Document ${id} not found`));
      }
      return ok({ document, content });
    },
  };
}

export function createInMemoryAgentTaskRepository(): AgentTaskRepository {
  const store = new Map<AgentTask["id"], AgentTask>();
  return {
    async getById(id) {
      const found = store.get(id);
      return found
        ? ok(found)
        : err(appError("NOT_FOUND", `Agent task ${id} not found`));
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
}

export type InMemoryPersistence = {
  readonly citizens: CitizenRepository;
  readonly cases: ServiceCaseRepository;
  readonly documents: DocumentStore;
  readonly tasks: AgentTaskRepository;
};

export function createInMemoryPersistence(): InMemoryPersistence {
  return {
    citizens: createInMemoryCitizenRepository(),
    cases: createInMemoryServiceCaseRepository(),
    documents: createInMemoryDocumentStore(),
    tasks: createInMemoryAgentTaskRepository(),
  };
}
