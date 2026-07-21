import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, JsonRpcProvider, Wallet, ZeroHash } from "ethers";
import { createEgovPlatformAdapters, processEnv } from "../packages/adapters-egov-platform/dist/index.js";
import { runWeeklyAccountabilityRag } from "../packages/application/dist/index.js";

const root = resolve(import.meta.dirname, "..");
try { process.loadEnvFile?.(resolve(root, ".env")); } catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const publishChain = process.argv.includes("--publish-chain");
const sha = (value) => `0x${createHash("sha256").update(value).digest("hex")}`;
const jsonArray = (value, name) => {
  if (!value?.trim()) return [];
  const parsed = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error(`${name} must be a JSON array`);
  return parsed;
};
const allowedDomains = new Set(
  (process.env.ACCOUNTABILITY_RAG_ALLOWED_DOMAINS ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
);

function approvedUrl(value) {
  const url = new URL(String(value));
  if (url.protocol !== "https:") throw new Error(`Only HTTPS evidence URLs are allowed: ${url.hostname}`);
  if (allowedDomains.size > 0 && !allowedDomains.has(url.hostname.toLowerCase())) {
    throw new Error(`Evidence domain is not allowlisted: ${url.hostname}`);
  }
  return url.toString();
}

function normalizeEvidence(raw, fallbackSource) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  const snippet = typeof raw.snippet === "string" ? raw.snippet.trim().slice(0, 1200) : "";
  const publishedAt = typeof raw.publishedAt === "string" ? raw.publishedAt : "";
  if (!title || !snippet || !Number.isFinite(Date.parse(publishedAt))) return undefined;
  const url = approvedUrl(raw.url);
  const source = typeof raw.source === "string" && raw.source.trim() ? raw.source.trim() : fallbackSource;
  return {
    source,
    title,
    url,
    publishedAt: new Date(publishedAt).toISOString(),
    snippet,
    contentDigest: sha(JSON.stringify({ source, title, url, publishedAt, snippet })),
  };
}

async function loadEvidence() {
  const all = [];
  const inputFile = process.env.ACCOUNTABILITY_RAG_EVIDENCE_FILE?.trim();
  if (inputFile) {
    const parsed = JSON.parse(await readFile(resolve(root, inputFile), "utf8"));
    const rows = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(rows)) throw new Error("ACCOUNTABILITY_RAG_EVIDENCE_FILE must contain an array or {items: []}");
    for (const row of rows) {
      const evidence = normalizeEvidence(row, "Configured evidence file");
      if (evidence) all.push(evidence);
    }
  }

  const sourceUrls = jsonArray(process.env.ACCOUNTABILITY_RAG_SOURCE_URLS_JSON, "ACCOUNTABILITY_RAG_SOURCE_URLS_JSON");
  const bearer = process.env.ACCOUNTABILITY_RAG_SOURCE_BEARER?.trim();
  for (const sourceUrl of sourceUrls) {
    const endpoint = approvedUrl(sourceUrl);
    const response = await fetch(endpoint, {
      headers: { accept: "application/json", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
    });
    if (!response.ok) throw new Error(`Evidence source ${new URL(endpoint).hostname} returned HTTP ${response.status}`);
    const parsed = await response.json();
    const rows = Array.isArray(parsed) ? parsed : parsed.items;
    if (!Array.isArray(rows)) throw new Error(`Evidence source ${new URL(endpoint).hostname} must return [] or {items: []}`);
    for (const row of rows) {
      const evidence = normalizeEvidence(row, new URL(endpoint).hostname);
      if (evidence) all.push(evidence);
    }
  }
  if (all.length === 0) {
    throw new Error("No evidence loaded. Configure ACCOUNTABILITY_RAG_EVIDENCE_FILE or ACCOUNTABILITY_RAG_SOURCE_URLS_JSON.");
  }
  return all;
}

async function publishSignals(artifact) {
  if (!publishChain) return { status: "NOT_REQUESTED", records: [] };
  if (allowedDomains.size === 0) throw new Error("--publish-chain requires ACCOUNTABILITY_RAG_ALLOWED_DOMAINS");
  const rpcUrl = process.env.EGOVCHAIN_RPC_URL?.trim();
  const privateKey = process.env.EGOVCHAIN_SIGNER_PRIVATE_KEY?.trim();
  const address = process.env.TOLVARIS_REPORT_REGISTRY_ADDRESS?.trim();
  if (!rpcUrl || !privateKey || !address) {
    throw new Error("--publish-chain requires EGOVCHAIN_RPC_URL, EGOVCHAIN_SIGNER_PRIVATE_KEY, and TOLVARIS_REPORT_REGISTRY_ADDRESS");
  }
  const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
  const expectedChainId = BigInt(process.env.EGOVCHAIN_CHAIN_ID || "13371");
  const network = await provider.getNetwork();
  if (network.chainId !== expectedChainId) throw new Error(`Unexpected chain ID ${network.chainId}`);
  const contract = new Contract(address, [
    "function publishExternalEvidenceSignal((bytes32 signalId,bytes32 projectKey,bytes32 sourceContentDigest,bytes32 normalizedClaimDigest,string sourceUrl,string sourcePublisher,string category,string status,uint64 recordedAt))",
    "function getExternalEvidenceSignal(bytes32) view returns (tuple(bytes32 signalId,bytes32 projectKey,bytes32 sourceContentDigest,bytes32 normalizedClaimDigest,string sourceUrl,string sourcePublisher,string category,string status,uint64 recordedAt))",
  ], new Wallet(privateKey, provider));
  const evidenceByUrl = new Map(artifact.evidence.map((item) => [item.url, item]));
  const records = [];
  for (const signal of artifact.signals) {
    const evidence = evidenceByUrl.get(signal.sourceUrl);
    if (!evidence) continue;
    const signalId = sha(`WEEKLY_RAG|${signal.sourceUrl}|${evidence.contentDigest}|${signal.allegationCategory}`);
    const existing = await contract.getExternalEvidenceSignal(signalId);
    if (existing.recordedAt > 0n) {
      records.push({ signalId, status: "ALREADY_RECORDED" });
      continue;
    }
    const transaction = await contract.publishExternalEvidenceSignal([
      signalId,
      ZeroHash,
      evidence.contentDigest,
      sha(JSON.stringify(signal)),
      signal.sourceUrl,
      evidence.source,
      signal.allegationCategory,
      "UNVERIFIED_MEDIA_SIGNAL",
      0,
    ], { type: 0, gasPrice: 0 });
    const receipt = await transaction.wait(1);
    records.push({ signalId, status: "PUBLISHED", transactionHash: transaction.hash, blockNumber: Number(receipt.blockNumber) });
  }
  return { status: "COMPLETE", chainId: network.chainId.toString(), registryAddress: address, records };
}

const generatedAt = new Date();
const periodEnd = generatedAt;
const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
const manilaParts = Object.fromEntries(
  new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(periodEnd)
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]),
);
const runId = `weekly-accountability-${manilaParts.year}-${manilaParts.month}-${manilaParts.day}`;
const corpus = await loadEvidence();
const retriever = {
  async search({ query, limit }) {
    const term = query.toLocaleLowerCase("en-PH");
    return corpus
      .filter((item) => `${item.title} ${item.snippet}`.toLocaleLowerCase("en-PH").includes(term))
      .slice(0, limit);
  },
};
const platform = createEgovPlatformAdapters(processEnv());
const result = await runWeeklyAccountabilityRag(
  { retriever, egovAi: platform.egovAi },
  {
    runId,
    generatedAt: generatedAt.toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  },
);
if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
const blockchain = await publishSignals(result.value);
const report = {
  ...result.value,
  automation: {
    cadence: "WEEKLY",
    eReportSubmission: "HUMAN_REVIEW_REQUIRED",
    blockchainPublication: blockchain.status,
    disclaimer: "Keyword matches and AI normalization are unverified review signals, not findings of corruption, guilt, or legal violations.",
  },
  blockchain,
};
const outputDirectory = resolve(root, ".local/reports");
await mkdir(outputDirectory, { recursive: true });
await writeFile(resolve(outputDirectory, `${runId}.json`), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
await writeFile(resolve(outputDirectory, "weekly-accountability-rag-latest.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({
  output: `.local/reports/${runId}.json`,
  evidence: report.evidence.length,
  signals: report.signals.length,
  eReportDrafts: report.eReportDrafts.length,
  blockchain: report.blockchain.status,
}, null, 2));
