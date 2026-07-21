import type {
  AgentRole,
  AgentTask,
  AgentTaskId,
  PipelineStage,
} from "@egov/domain";
import { appError, createId, err, newId, ok, type Result } from "@egov/shared";
import type {
  AgentMailbox,
  AgentTaskRepository,
  Clock,
  EventBus,
  LlmPort,
} from "../ports/index.js";

const STAGE_OWNER: Record<PipelineStage, AgentRole> = {
  foundation: "architect",
  design: "designer",
  build: "builder",
  verify: "verifier",
  ship: "ops",
};

export type DispatchAgentTaskInput = {
  readonly stage: PipelineStage;
  readonly summary: string;
  readonly correlationId: string;
};

export type DispatchAgentTaskDeps = {
  readonly tasks: AgentTaskRepository;
  readonly mailbox: AgentMailbox;
  readonly clock: Clock;
};

export async function dispatchAgentTask(
  deps: DispatchAgentTaskDeps,
  input: DispatchAgentTaskInput,
): Promise<Result<AgentTask>> {
  const owner = STAGE_OWNER[input.stage];
  const now = deps.clock.now();
  const task: AgentTask = {
    id: newId("task"),
    stage: input.stage,
    owner,
    status: "queued",
    summary: input.summary.trim(),
    correlationId: input.correlationId,
    createdAt: now,
    updatedAt: now,
  };

  if (task.summary.length === 0) {
    return err(appError("VALIDATION", "Agent task summary is required"));
  }

  const saved = await deps.tasks.save(task);
  if (!saved.ok) return saved;

  const sent = await deps.mailbox.send({
    from: owner,
    to: owner,
    stage: task.stage,
    correlationId: task.correlationId,
    payload: JSON.stringify({
      kind: "task_dispatched",
      taskId: task.id,
      summary: task.summary,
    }),
  });
  if (!sent.ok) return err(sent.error);

  return ok(saved.value);
}

export type RunAgentTurnDeps = {
  readonly tasks: AgentTaskRepository;
  readonly mailbox: AgentMailbox;
  readonly llm: LlmPort;
  readonly events: EventBus;
  readonly clock: Clock;
};

export async function runAgentTurn(
  deps: RunAgentTurnDeps,
  role: AgentRole,
): Promise<Result<{ handled: boolean; reply?: string }>> {
  const received = await deps.mailbox.receive(role);
  if (!received.ok) return err(received.error);
  if (received.value === null) return ok({ handled: false });

  const completion = await deps.llm.complete([
    {
      role: "system",
      content: `You are the eGov ${role} agent. Stay within your stage charter. Do not invent citizen data.`,
    },
    { role: "user", content: received.value.payload },
  ]);

  if (!completion.ok) {
    // Escalate per docs/fallback.md: LLM failure → needs_human.
    // Best-effort: only when the mailbox payload carries a taskId
    // (as dispatched by dispatchAgentTask).
    const taskId = extractTaskId(received.value.payload);
    if (taskId !== null) {
      const existing = await deps.tasks.getById(taskId);
      if (existing.ok) {
        await deps.tasks.save({
          ...existing.value,
          status: "needs_human",
          updatedAt: deps.clock.now(),
        });
      }
    }
    return err(completion.error);
  }

  await deps.mailbox.send({
    from: role,
    to: "broadcast",
    stage: received.value.stage,
    correlationId: received.value.correlationId,
    payload: completion.value.content,
  });

  return ok({ handled: true, reply: completion.value.content });
}

function extractTaskId(payload: string): AgentTaskId | null {
  try {
    const parsed = JSON.parse(payload) as { taskId?: unknown };
    if (typeof parsed.taskId === "string" && parsed.taskId.length > 0) {
      return createId<"AgentTaskId">(parsed.taskId);
    }
  } catch {
    // Non-JSON payloads cannot be correlated to a task.
  }
  return null;
}
