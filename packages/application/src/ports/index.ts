import type {
  AgentRole,
  AgentTask,
  Benefit,
  BenefitId,
  BenefitMatch,
  BenefitMatchId,
  CaseDocument,
  Citizen,
  CitizenId,
  DocumentId,
  DomainEvent,
  PipelineStage,
  ServiceCase,
  ServiceCaseId,
  ServiceCaseStatus,
} from "@egov/domain";
import type { Result } from "@egov/shared";

export type Clock = {
  now(): Date;
};

/** Content hashing, kept behind a port like Clock — application must not
 * import node:crypto directly (adapters own I/O and platform primitives). */
export type HashPort = {
  sha256Hex(input: string): Promise<string>;
};

export type CitizenRepository = {
  getById(id: CitizenId): Promise<Result<Citizen>>;
  save(citizen: Citizen): Promise<Result<Citizen>>;
};

export type ServiceCaseRepository = {
  getById(id: ServiceCaseId): Promise<Result<ServiceCase>>;
  save(serviceCase: ServiceCase): Promise<Result<ServiceCase>>;
};

export type DocumentStore = {
  save(document: CaseDocument, content: Uint8Array): Promise<Result<CaseDocument>>;
  get(id: DocumentId): Promise<Result<{ document: CaseDocument; content: Uint8Array }>>;
};

export type EventBus = {
  publish(event: DomainEvent): Promise<Result<void>>;
};

export type LlmMessage = {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
};

export type LlmPort = {
  complete(messages: readonly LlmMessage[]): Promise<Result<{ content: string }>>;
};

export type AgentMessage = {
  readonly id: string;
  readonly from: AgentRole;
  readonly to: AgentRole | "broadcast";
  readonly stage: PipelineStage;
  readonly correlationId: string;
  readonly payload: string;
  readonly createdAt: Date;
};

export type AgentMailbox = {
  send(message: Omit<AgentMessage, "id" | "createdAt">): Promise<Result<AgentMessage>>;
  receive(role: AgentRole): Promise<Result<AgentMessage | null>>;
};

export type AgentTaskRepository = {
  getById(id: AgentTask["id"]): Promise<Result<AgentTask>>;
  save(task: AgentTask): Promise<Result<AgentTask>>;
  listByCorrelation(correlationId: string): Promise<Result<readonly AgentTask[]>>;
};

export type AdvanceCaseInput = {
  readonly caseId: ServiceCaseId;
  readonly nextStatus: ServiceCaseStatus;
};

export type SubmitCaseInput = {
  readonly citizenId: CitizenId;
  readonly title: string;
};

/** Hardcoded-for-hackathon benefit catalog — see docs/architecture.md
 * "Product Vision" BANGON section for why this isn't a live agency API. */
export type BenefitCatalogPort = {
  listAll(): Promise<Result<readonly Benefit[]>>;
  getById(id: BenefitId): Promise<Result<Benefit>>;
};

export type BenefitMatchRepository = {
  getById(id: BenefitMatchId): Promise<Result<BenefitMatch>>;
  save(match: BenefitMatch): Promise<Result<BenefitMatch>>;
};

export * from "./platform.js";
