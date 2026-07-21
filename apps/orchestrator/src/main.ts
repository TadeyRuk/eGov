import {
  createInMemoryAgentMailbox,
  createStubLlmPort,
} from "@egov/adapters-ai";
import { createInMemoryEventBus } from "@egov/adapters-messaging";
import { createInMemoryPersistence } from "@egov/adapters-persistence";
import {
  dispatchAgentTask,
  runAgentTurn,
  type Clock,
} from "@egov/application";
import { newId } from "@egov/shared";
import { ALL_AGENTS, PIPELINE_STAGES } from "./agents/registry.js";

const clock: Clock = { now: () => new Date() };
const persistence = createInMemoryPersistence();
const events = createInMemoryEventBus();
const mailbox = createInMemoryAgentMailbox(clock);
const llm = createStubLlmPort();

const correlationId = newId("corr");

async function main(): Promise<void> {
  console.log("eGov orchestrator — multi-agent foundation line");
  console.log(`correlationId=${correlationId}`);

  for (const stage of PIPELINE_STAGES) {
    const dispatched = await dispatchAgentTask(
      { tasks: persistence.tasks, mailbox, clock },
      {
        stage,
        summary: `Stage ${stage}: collaborate on eGov ${stage} outcomes`,
        correlationId,
      },
    );

    if (!dispatched.ok) {
      console.error(`Failed to dispatch ${stage}:`, dispatched.error);
      process.exitCode = 1;
      return;
    }

    console.log(`dispatched ${stage} → ${dispatched.value.owner} (${dispatched.value.id})`);

    for (const role of ALL_AGENTS) {
      const turn = await runAgentTurn(
        {
          tasks: persistence.tasks,
          mailbox,
          llm,
          events,
          clock,
        },
        role,
      );
      if (!turn.ok) {
        console.error(`Agent ${role} blocked:`, turn.error);
        continue;
      }
      if (turn.value.handled) {
        console.log(`  ${role}: ${turn.value.reply?.slice(0, 120)}`);
      }
    }
  }

  console.log("pipeline pass complete (stub LLM). Human gates still required for ship.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
