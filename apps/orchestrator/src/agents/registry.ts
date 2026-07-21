import type { AgentRole, PipelineStage } from "@egov/domain";

/** Ordered delivery line stages. */
export const PIPELINE_STAGES: readonly PipelineStage[] = [
  "foundation",
  "design",
  "build",
  "verify",
  "ship",
] as const;

export const STAGE_AGENTS: Record<PipelineStage, AgentRole> = {
  foundation: "architect",
  design: "designer",
  build: "builder",
  verify: "verifier",
  ship: "ops",
};

export const ALL_AGENTS: readonly AgentRole[] = [
  "architect",
  "designer",
  "builder",
  "verifier",
  "ops",
];
