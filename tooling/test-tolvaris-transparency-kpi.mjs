import { performance } from "node:perf_hooks";
import { Contract, JsonRpcProvider, Wallet, ZeroHash } from "ethers";

const ABI = [
  "function hasProject(string dataset,string sourceRecordId) view returns (bool)",
  "function projectKey(string dataset,string sourceRecordId) pure returns (bytes32)",
  "function projectFingerprint(string dataset,string agencyCode,string canonicalTitle,string canonicalLocation) pure returns (bytes32)",
  "function findProjectByFingerprint(bytes32 fingerprint) view returns (bytes32 key,bool exists)",
  "function getProject(bytes32 key) view returns ((string dataset,string sourceRecordId,string title,string location,string agencyCode,string implementingUnit,string sourceUrl,bytes32 projectFingerprint,bool exists))",
  "function publishProject(string dataset,string sourceRecordId,string title,string location,string agencyCode,string implementingUnit,string sourceUrl) returns (bytes32 key)",
];

const rpcUrl = process.env.EGOVCHAIN_RPC_URL?.trim();
const address = process.env.TOLVARIS_TRANSPARENCY_REGISTRY_ADDRESS?.trim();
const privateKey = process.env.EGOVCHAIN_SIGNER_PRIVATE_KEY?.trim();
const iterations = Math.max(3, Number(process.env.TOLVARIS_KPI_ITERATIONS || 15));
if (!rpcUrl || !address || !privateKey) {
  throw new Error("RPC URL, transparency registry address, and signer key are required");
}

const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
const contract = new Contract(address, ABI, new Wallet(privateKey, provider));
const sample = {
  dataset: "LGSF",
  sourceRecordId: "SYNTHETIC-PROJECT-001",
  title: "Synthetic Local Government Infrastructure Project",
  location: "Sample City, Philippines",
  agencyCode: "DBM-SAMPLE",
  implementingUnit: "Sample Implementing Unit",
  sourceUrl: "https://dbm.gov.ph/",
};

async function timed(operation) {
  const started = performance.now();
  const value = await operation();
  return { value, milliseconds: performance.now() - started };
}

function latencySummary(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    averageMs: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)),
    p95Ms: Number(sorted[p95Index].toFixed(2)),
    minimumMs: Number(sorted[0].toFixed(2)),
    maximumMs: Number(sorted.at(-1).toFixed(2)),
  };
}

const expectedKey = await contract.projectKey(sample.dataset, sample.sourceRecordId);
const fingerprint = await contract.projectFingerprint(
  sample.dataset,
  sample.agencyCode,
  sample.title,
  sample.location,
);
const exactLatencies = [];
const fingerprintLatencies = [];
let exactHit = true;
let exactMiss = false;
let fingerprintHit = true;
let fingerprintMiss = false;

for (let index = 0; index < iterations; index += 1) {
  const exact = await timed(() => contract.hasProject(sample.dataset, sample.sourceRecordId));
  exactLatencies.push(exact.milliseconds);
  exactHit &&= exact.value === true;

  const byFingerprint = await timed(() => contract.findProjectByFingerprint(fingerprint));
  fingerprintLatencies.push(byFingerprint.milliseconds);
  fingerprintHit &&= byFingerprint.value.exists === true && byFingerprint.value.key === expectedKey;
}

exactMiss = (await contract.hasProject(sample.dataset, "SYNTHETIC-MISSING-999")) === false;
fingerprintMiss = (await contract.findProjectByFingerprint(ZeroHash)).exists === false;
const project = await contract.getProject(expectedKey);
const plaintextReadBack =
  project.dataset === sample.dataset &&
  project.sourceRecordId === sample.sourceRecordId &&
  project.title === sample.title &&
  project.location === sample.location &&
  project.agencyCode === sample.agencyCode;

let exactDuplicateRejected = false;
let contextualDuplicateRejected = false;
try {
  await contract.publishProject.staticCall(...Object.values(sample));
} catch {
  exactDuplicateRejected = true;
}
try {
  await contract.publishProject.staticCall(
    sample.dataset,
    "SYNTHETIC-PROJECT-ANOTHER-SOURCE-ID",
    sample.title,
    sample.location,
    sample.agencyCode,
    sample.implementingUnit,
    sample.sourceUrl,
  );
} catch {
  contextualDuplicateRejected = true;
}

const exactLatency = latencySummary(exactLatencies);
const fingerprintLatency = latencySummary(fingerprintLatencies);
const checks = {
  exactExistingRecordFound: exactHit,
  exactMissingRecordRejected: exactMiss,
  fingerprintExistingProjectFound: fingerprintHit,
  fingerprintMissingProjectRejected: fingerprintMiss,
  plaintextProjectReadBackMatches: plaintextReadBack,
  exactDuplicateWriteRejected: exactDuplicateRejected,
  contextualDuplicateWriteRejected: contextualDuplicateRejected,
};
const passedChecks = Object.values(checks).filter(Boolean).length;
const totalChecks = Object.keys(checks).length;
const latencyTargetMs = 2_000;

console.log(JSON.stringify({
  showcase: "Tolvaris DBM Compass Duplicate Detection KPI",
  result: passedChecks === totalChecks && exactLatency.p95Ms <= latencyTargetMs && fingerprintLatency.p95Ms <= latencyTargetMs
    ? "PASS"
    : "FAIL",
  score: `${passedChecks}/${totalChecks} correctness checks`,
  iterations,
  checks,
  latencyTargetMs,
  lookupLatency: {
    exactSourceKey: exactLatency,
    contextualFingerprint: fingerprintLatency,
  },
  publicSample: {
    dataset: project.dataset,
    sourceRecordId: project.sourceRecordId,
    title: project.title,
    location: project.location,
    agencyCode: project.agencyCode,
  },
}, null, 2));
