import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import solc from "solc";
import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourcePath = resolve(repositoryRoot, "contracts/TolvarisPublicProjectRegistry.sol");
const localEnvPath = resolve(repositoryRoot, ".local/tolvaris-registry.env");
const rpcUrl = process.env.EGOVCHAIN_RPC_URL?.trim();
const privateKey = process.env.EGOVCHAIN_SIGNER_PRIVATE_KEY?.trim();
const expectedChainId = BigInt(process.env.EGOVCHAIN_CHAIN_ID || "13371");
if (!rpcUrl || !privateKey) {
  throw new Error("EGOVCHAIN_RPC_URL and EGOVCHAIN_SIGNER_PRIVATE_KEY are required");
}

const source = await readFile(sourcePath, "utf8");
const compilerInput = {
  language: "Solidity",
  sources: { "TolvarisPublicProjectRegistry.sol": { content: source } },
  settings: {
    evmVersion: "paris",
    viaIR: true,
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const compiled = JSON.parse(solc.compile(JSON.stringify(compilerInput)));
const errors = (compiled.errors || []).filter((entry) => entry.severity === "error");
if (errors.length > 0) throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));
const artifact = compiled.contracts["TolvarisPublicProjectRegistry.sol"]
  .TolvarisPublicProjectRegistry;

const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
const network = await provider.getNetwork();
if (network.chainId !== expectedChainId) throw new Error(`Unexpected chain ID ${network.chainId}`);
const signer = new Wallet(privateKey, provider);
const factory = new ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, signer);
const contract = await factory.deploy({ type: 0, gasPrice: 0, gasLimit: 6_000_000 });
await contract.waitForDeployment();
const address = await contract.getAddress();

const agencyTransaction = await contract.publishAgency(
  "DBM-SAMPLE",
  "Department of Budget and Management (Synthetic Test)",
  { type: 0, gasPrice: 0 },
);
await agencyTransaction.wait(1);
const projectTransaction = await contract.publishProject(
  "LGSF",
  "SYNTHETIC-PROJECT-001",
  "Synthetic Local Government Infrastructure Project",
  "Sample City, Philippines",
  "DBM-SAMPLE",
  "Sample Implementing Unit",
  "https://dbm.gov.ph/",
  { type: 0, gasPrice: 0 },
);
const projectReceipt = await projectTransaction.wait(1);
const key = await contract.projectKey("LGSF", "SYNTHETIC-PROJECT-001");
const payloadHash = `0x${createHash("sha256").update("synthetic-dbm-compass-payload").digest("hex")}`;
const snapshotTransaction = await contract.publishBudgetSnapshot(
  key,
  2026,
  "2026-07-22",
  100_000_000n,
  80_000_000n,
  45_000_000n,
  30_000_000n,
  "ONGOING",
  payloadHash,
  { type: 0, gasPrice: 0 },
);
const snapshotReceipt = await snapshotTransaction.wait(1);
const project = await contract.getProject(key);
const snapshots = await contract.getBudgetSnapshots(key);
const exactProjectExists = await contract.hasProject("LGSF", "SYNTHETIC-PROJECT-001");
const fingerprintLookup = await contract.findProjectByFingerprint(project.projectFingerprint);

let localEnv = await readFile(localEnvPath, "utf8").catch(() => "");
const line = `TOLVARIS_TRANSPARENCY_REGISTRY_ADDRESS=${address}`;
if (/^TOLVARIS_TRANSPARENCY_REGISTRY_ADDRESS=.*$/m.test(localEnv)) {
  localEnv = localEnv.replace(/^TOLVARIS_TRANSPARENCY_REGISTRY_ADDRESS=.*$/m, line);
} else {
  localEnv = `${localEnv.trimEnd()}\n${line}\n`;
}
await writeFile(localEnvPath, localEnv, { mode: 0o600 });

console.log(JSON.stringify({
  chainId: network.chainId.toString(),
  registryAddress: address,
  deploymentTransactionHash: contract.deploymentTransaction()?.hash ?? null,
  projectTransactionHash: projectTransaction.hash,
  projectBlock: projectReceipt?.blockNumber ?? null,
  snapshotTransactionHash: snapshotTransaction.hash,
  snapshotBlock: snapshotReceipt?.blockNumber ?? null,
  readBack: {
    dataset: project.dataset,
    sourceRecordId: project.sourceRecordId,
    title: project.title,
    location: project.location,
    agencyCode: project.agencyCode,
    snapshotCount: snapshots.length,
    fiscalYear: Number(snapshots[0]?.fiscalYear ?? 0),
    status: snapshots[0]?.status ?? "",
    exactProjectExists,
    fingerprintFound: fingerprintLookup.exists,
    fingerprintProjectKey: fingerprintLookup.key,
  },
  localSecretsFile: ".local/tolvaris-registry.env",
}, null, 2));
