import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createEgovPlatformAdapters, processEnv } from "../packages/adapters-egov-platform/dist/index.js";
import { orchestrateEgovAi } from "../packages/application/dist/index.js";

const platform = createEgovPlatformAdapters(processEnv());
const before = await platform.egovAi.credits();
const result = await orchestrateEgovAi(
  {
    egovAi: platform.egovAi,
    log(entry) {
      console.log(JSON.stringify({
        level: entry.status === "failed" ? "error" : "info",
        ...entry,
      }));
    },
  },
  {
    prompt: "Explain briefly why a government-ledger anomaly is only a review signal, add verifiable Philippine legal or audit context, translate the final response to Filipino, and make it available as speech.",
    sourceLang: "en",
    targetLang: "fil",
    translator: "auto",
    speech: "auto",
    laws: "on",
    correlationId: `ai-kpi-${Date.now()}`,
  },
);
const after = await platform.egovAi.credits();
const checks = result.ok
  ? {
      orchestrationCompleted: true,
      assistantReturnedAnswer: result.value.assistantAnswer.length > 0,
      assistantSelectedTranslator: result.value.decision.translator,
      assistantSelectedSpeech: result.value.decision.speech,
      lawsSelected: result.value.decision.laws,
      lawsReturnedOutput: Boolean(result.value.legalAnalysis),
      translatorReturnedOutput: Boolean(result.value.translatedAnswer),
      speechReturnedOutput: Boolean(result.value.speechOutput),
      allSelectedToolsSucceeded: result.value.metrics.tools
        .filter((metric) => metric.status !== "skipped")
        .every((metric) => metric.status === "ok"),
    }
  : { orchestrationCompleted: false };
const passed = Object.values(checks).filter(Boolean).length;
const total = Object.keys(checks).length;
const generatedAt = new Date().toISOString();
const report = {
  generatedAt,
  kind: "egov-ai-live-kpi",
  result: result.ok && passed === total ? "PASS" : "FAIL",
  score: `${passed}/${total}`,
  checks,
  orchestrationStatus: result.ok ? result.value.status : "failed",
  metrics: result.ok ? result.value.metrics : result.metrics,
  credits: {
    before: before.ok ? before.value.creditsRemaining : null,
    after: after.ok ? after.value.creditsRemaining : null,
    consumed: before.ok && after.ok
      ? before.value.creditsRemaining - after.value.creditsRemaining
      : null,
  },
};

const reportsDirectory = resolve(process.cwd(), ".local/reports");
await mkdir(reportsDirectory, { recursive: true });
await writeFile(
  resolve(reportsDirectory, `egov-ai-kpi-${generatedAt.replace(/[:.]/g, "-")}.json`),
  `${JSON.stringify(report, null, 2)}\n`,
  { mode: 0o600 },
);
await writeFile(
  resolve(reportsDirectory, "egov-ai-kpi-latest.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  { mode: 0o600 },
);
console.log(JSON.stringify(report, null, 2));
if (report.result !== "PASS") process.exitCode = 1;
