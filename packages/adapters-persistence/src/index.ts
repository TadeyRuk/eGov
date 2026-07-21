import type {
  AgentTaskRepository,
  BenefitCatalogPort,
  CitizenRepository,
  DocumentStore,
  ServiceCaseRepository,
} from "@egov/application";
import type {
  AgentTask,
  Benefit,
  BenefitId,
  CaseDocument,
  Citizen,
  CitizenId,
  DocumentId,
  ServiceCase,
  ServiceCaseId,
} from "@egov/domain";
import { appError, createId, err, ok, type Result } from "@egov/shared";

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

/** Hardcoded-for-hackathon benefit list. No live agency benefit-catalog
 * API exists among the 9 platform services — see docs/architecture.md
 * "Product Vision" BANGON section. Eligibility fields are restricted to
 * what eVerify/PSA actually returns (DOB, civil status, vital status). */
const SEED_BENEFITS: readonly Benefit[] = [
  {
    id: createId<"BenefitId">("benefit_sss_senior_pension"),
    title: "SSS Senior Citizen Pension",
    agency: "SSS",
    isFinancial: true,
    rule: { minAge: 60, vitalStatusIn: ["ALIVE"] },
    fundCheck: {
      dataset: "SAAODB",
      query: { agency: "SSS", program: "senior_pension" },
    },
  },
  {
    id: createId<"BenefitId">("benefit_philhealth_senior_subsidy"),
    title: "PhilHealth Senior Citizen Premium Subsidy",
    agency: "PhilHealth",
    isFinancial: true,
    rule: { minAge: 60, vitalStatusIn: ["ALIVE"] },
    fundCheck: {
      dataset: "NCA",
      query: { agency: "PhilHealth", program: "senior_subsidy" },
    },
  },
  {
    id: createId<"BenefitId">("benefit_dswd_widowed_assistance"),
    title: "DSWD Widowed Citizen Assistance",
    agency: "DSWD",
    isFinancial: true,
    rule: { civilStatusIn: ["WIDOWED"], vitalStatusIn: ["ALIVE"] },
    fundCheck: {
      dataset: "SARO",
      query: { agency: "DSWD", program: "widowed_assistance" },
    },
  },
];

export function createInMemoryBenefitCatalog(
  seed: readonly Benefit[] = SEED_BENEFITS,
): BenefitCatalogPort {
  const store = new Map<BenefitId, Benefit>(seed.map((b) => [b.id, b]));
  return {
    async listAll() {
      return ok([...store.values()]);
    },
    async getById(id) {
      const found = store.get(id);
      return found
        ? ok(found)
        : err(appError("NOT_FOUND", `Benefit ${id} not found`));
    },
  };
}

export type InMemoryPersistence = {
  readonly citizens: CitizenRepository;
  readonly cases: ServiceCaseRepository;
  readonly documents: DocumentStore;
  readonly tasks: AgentTaskRepository;
  readonly benefits: BenefitCatalogPort;
};

export function createInMemoryPersistence(): InMemoryPersistence {
  return {
    citizens: createInMemoryCitizenRepository(),
    cases: createInMemoryServiceCaseRepository(),
    documents: createInMemoryDocumentStore(),
    tasks: createInMemoryAgentTaskRepository(),
    benefits: createInMemoryBenefitCatalog(),
  };
}
