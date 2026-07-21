import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, JsonRpcProvider } from "ethers";

const webUrl = (process.env.EGOV_WEB_URL || "https://egov-hackathon.vercel.app").replace(/\/+$/, "");
const apiUrl = process.env.EGOV_API_URL?.replace(/\/+$/, "");
const thresholdMs = Number(process.env.SYSTEM_KPI_RESPONSE_TARGET_MS || 3_000);
const rows = [];

async function check(name, operation, options = {}) {
  const startedAt = performance.now();
  try {
    const detail = await operation();
    const durationMs = Number((performance.now() - startedAt).toFixed(2));
    const withinTarget = options.ignoreLatency === true || durationMs <= thresholdMs;
    rows.push({
      name,
      status: withinTarget ? "pass" : "fail",
      durationMs,
      targetMs: options.ignoreLatency === true ? null : thresholdMs,
      detail: withinTarget ? detail : `${detail}; response-time target exceeded`,
    });
  } catch (error) {
    rows.push({
      name,
      status: "fail",
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      targetMs: options.ignoreLatency === true ? null : thresholdMs,
      detail: error instanceof Error ? error.message : "Unknown failure",
    });
  }
}

function skip(name, detail) {
  rows.push({ name, status: "skip", durationMs: 0, targetMs: null, detail });
}

async function jsonFetch(url, init, expectedStatus = 200) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const body = await response.json().catch(() => ({}));
  if (response.status !== expectedStatus) throw new Error(`expected HTTP ${expectedStatus}, received ${response.status}`);
  return body;
}

await check("website-home", async () => {
  const response = await fetch(`${webUrl}/`, { signal: AbortSignal.timeout(10_000) });
  const html = await response.text();
  if (!response.ok || !html.includes("egov-sso-widget-button")) throw new Error("SSO page marker missing");
  return "Vercel page and SSO mount point available";
});

await check("website-config", async () => {
  const body = await jsonFetch(`${webUrl}/api/config`);
  if (!body.clientId || body.environment !== "STAGING") throw new Error("widget configuration is incomplete");
  return "STAGING widget configuration available";
});

await check("website-transparency-dashboard", async () => {
  const response = await fetch(`${webUrl}/transparency.html`, { signal: AbortSignal.timeout(10_000) });
  const html = await response.text();
  if (!response.ok || !html.includes("Tolvaris Transparency Analytics")) {
    throw new Error("transparency dashboard marker missing");
  }
  return "synthetic transparency dashboard available";
});

await check("website-transparency-data", async () => {
  const body = await jsonFetch(`${webUrl}/data/mock-government-analytics.json`);
  if (body.isSynthetic !== true || body.accountingEquation?.balanced !== true || body.kpis?.anomalyCount < 1) {
    throw new Error("synthetic analytics dataset is incomplete");
  }
  return `${body.kpis.projects} projects, ${body.kpis.journalEntries} balanced-ledger entries, ${body.kpis.anomalyCount} review signals`;
});

await check("website-exchange-validation", async () => {
  await jsonFetch(`${webUrl}/api/auth/egov/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }, 400);
  return "SSO exchange rejects missing one-time code";
});

await check("website-card-ledger", async () => {
  const secret = process.env.TOLVARIS_OWNER_HMAC_SECRET;
  if (!secret) throw new Error("local owner HMAC secret is not configured");
  const owner = `0x${createHmac("sha256", secret).update("synthetic-egov-user-001").digest("hex")}`;
  const body = await jsonFetch(`${webUrl}/api/cards?ownerCommitment=${owner}`);
  if (!body.configured || !Array.isArray(body.cards) || body.cards.length < 1) {
    throw new Error("synthetic card ledger read returned no cards");
  }
  return `card registry available (${body.cards.length} synthetic record)`;
});

await check("egovchain-rpc", async () => {
  const rpcUrl = process.env.EGOVCHAIN_RPC_URL;
  if (!rpcUrl) throw new Error("EGOVCHAIN_RPC_URL is not configured");
  const body = await jsonFetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
  });
  const expected = BigInt(process.env.EGOVCHAIN_CHAIN_ID || "13371");
  if (BigInt(body.result) !== expected) throw new Error("unexpected chain ID");
  return `chain ${expected} available`;
});

await check("tolvaris-transparency-lookup", async () => {
  const rpcUrl = process.env.EGOVCHAIN_RPC_URL;
  const address = process.env.TOLVARIS_TRANSPARENCY_REGISTRY_ADDRESS;
  if (!rpcUrl || !address) throw new Error("transparency registry is not configured");
  const contract = new Contract(
    address,
    ["function hasProject(string dataset,string sourceRecordId) view returns (bool)"],
    new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true }),
  );
  const exists = await contract.getFunction("hasProject")("LGSF", "SYNTHETIC-PROJECT-001");
  if (!exists) throw new Error("synthetic transparency project was not found");
  return "exact project hash index available";
});

if (apiUrl) {
  await check("application-api-health", async () => {
    const body = await jsonFetch(`${apiUrl}/health`);
    if (body.status !== "ok") throw new Error("API did not report ok");
    return "application API health route available";
  });
} else {
  skip("application-api-health", "set EGOV_API_URL when the application API is deployed");
}

const passed = rows.filter((row) => row.status === "pass").length;
const failed = rows.filter((row) => row.status === "fail").length;
const skipped = rows.filter((row) => row.status === "skip").length;
const measured = passed + failed;
const availabilityPercent = measured === 0 ? 0 : Number(((passed / measured) * 100).toFixed(2));
const generatedAt = new Date().toISOString();
const report = {
  generatedAt,
  kind: "system-kpi",
  result: failed === 0 ? "PASS" : "FAIL",
  responseTimeTargetMs: thresholdMs,
  summary: { passed, failed, skipped, availabilityPercent },
  rows,
};

const reportsDirectory = resolve(process.cwd(), ".local/reports");
await mkdir(reportsDirectory, { recursive: true });
await writeFile(
  resolve(reportsDirectory, `system-kpi-${generatedAt.replace(/[:.]/g, "-")}.json`),
  `${JSON.stringify(report, null, 2)}\n`,
  { mode: 0o600 },
);
await writeFile(
  resolve(reportsDirectory, "system-kpi-latest.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  { mode: 0o600 },
);
console.log(JSON.stringify(report, null, 2));
if (failed > 0) process.exitCode = 1;
