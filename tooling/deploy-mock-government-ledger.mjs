import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import solc from "solc";
import {
  Contract,
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  ZeroHash,
} from "ethers";

const repositoryRoot = resolve(import.meta.dirname, "..");
const localEnvPath = resolve(repositoryRoot, ".local/tolvaris-registry.env");
const resultsPath = resolve(repositoryRoot, ".local/mock-government-chain-results.json");
const dataset = JSON.parse(await readFile(resolve(repositoryRoot, "data/mock-government-ledger.json"), "utf8"));
const source = await readFile(resolve(repositoryRoot, "contracts/TolvarisGeneralLedger.sol"), "utf8");
const rpcUrl = process.env.EGOVCHAIN_RPC_URL?.trim();
const privateKey = process.env.EGOVCHAIN_SIGNER_PRIVATE_KEY?.trim();
const transparencyAddress = process.env.TOLVARIS_TRANSPARENCY_REGISTRY_ADDRESS?.trim();
const expectedChainId = BigInt(process.env.EGOVCHAIN_CHAIN_ID || "13371");
if (!rpcUrl || !privateKey || !transparencyAddress) {
  throw new Error("Chain RPC, signer, and transparency registry address are required");
}

const input = {
  language: "Solidity",
  sources: { "TolvarisGeneralLedger.sol": { content: source } },
  settings: {
    evmVersion: "paris",
    viaIR: true,
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const compiled = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (compiled.errors || []).filter((entry) => entry.severity === "error");
if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));
const artifact = compiled.contracts["TolvarisGeneralLedger.sol"].TolvarisGeneralLedger;

const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
const network = await provider.getNetwork();
if (network.chainId !== expectedChainId) throw new Error(`Unexpected chain ID ${network.chainId}`);
const signer = new Wallet(privateKey, provider);
const ledger = await new ContractFactory(
  artifact.abi,
  `0x${artifact.evm.bytecode.object}`,
  signer,
).deploy({ type: 0, gasPrice: 0, gasLimit: 7_000_000 });
await ledger.waitForDeployment();
const ledgerAddress = await ledger.getAddress();

const transparency = new Contract(transparencyAddress, [
  "function publishAgency(string code,string name)",
  "function hasProject(string dataset,string sourceRecordId) view returns (bool)",
  "function publishProject(string dataset,string sourceRecordId,string title,string location,string agencyCode,string implementingUnit,string sourceUrl) returns (bytes32 key)",
  "function projectKey(string dataset,string sourceRecordId) pure returns (bytes32)",
  "function publishBudgetSnapshot(bytes32 key,uint32 fiscalYear,string asOfDate,uint256 appropriationsCentavos,uint256 allotmentsCentavos,uint256 obligationsCentavos,uint256 disbursementsCentavos,string status,bytes32 sourcePayloadHash)",
], signer);

const publicKeys = {};
const privateKeys = new Map();
for (const agency of dataset.agencies) {
  const pair = generateKeyPairSync("ed25519");
  publicKeys[agency.signerKeyId] = {
    agencyCode: agency.code,
    algorithm: "Ed25519",
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
  privateKeys.set(agency.signerKeyId, pair.privateKey);
}

const agencyTransactions = [];
for (const agency of dataset.agencies) {
  const transaction = await transparency.getFunction("publishAgency")(
    agency.code,
    agency.name,
    { type: 0, gasPrice: 0 },
  );
  const receipt = await transaction.wait(1);
  agencyTransactions.push({ agencyCode: agency.code, transactionHash: transaction.hash, blockNumber: receipt?.blockNumber ?? null });
}

const projectTransactions = [];
const projectKeys = new Map();
for (const project of dataset.projects) {
  const key = await transparency.getFunction("projectKey")(project.dataset, project.sourceRecordId);
  projectKeys.set(project.sourceRecordId, key);
  const exists = await transparency.getFunction("hasProject")(project.dataset, project.sourceRecordId);
  if (exists) {
    projectTransactions.push({ sourceRecordId: project.sourceRecordId, projectKey: key, alreadyExisted: true });
    continue;
  }
  const transaction = await transparency.getFunction("publishProject")(
    project.dataset,
    project.sourceRecordId,
    project.title,
    project.location,
    project.agencyCode,
    project.implementingUnit,
    project.sourceUrl,
    { type: 0, gasPrice: 0 },
  );
  const receipt = await transaction.wait(1);
  const payloadHash = `0x${createHash("sha256").update(JSON.stringify(project)).digest("hex")}`;
  const budget = project.budget;
  const snapshotTransaction = await transparency.getFunction("publishBudgetSnapshot")(
    key,
    budget.fiscalYear,
    budget.asOfDate,
    BigInt(budget.appropriationsCentavos),
    BigInt(budget.allotmentsCentavos),
    BigInt(budget.obligationsCentavos),
    BigInt(budget.disbursementsCentavos),
    budget.status,
    payloadHash,
    { type: 0, gasPrice: 0 },
  );
  const snapshotReceipt = await snapshotTransaction.wait(1);
  projectTransactions.push({
    sourceRecordId: project.sourceRecordId,
    projectKey: key,
    transactionHash: transaction.hash,
    blockNumber: receipt?.blockNumber ?? null,
    snapshotTransactionHash: snapshotTransaction.hash,
    snapshotBlockNumber: snapshotReceipt?.blockNumber ?? null,
    alreadyExisted: false,
  });
}

const journalTransactions = [];
for (const entry of dataset.journalEntries) {
  const agency = dataset.agencies.find((candidate) => candidate.code === entry.agencyCode);
  if (!agency) throw new Error(`No agency for ${entry.agencyCode}`);
  const digestBytes = createHash("sha256").update(JSON.stringify(entry)).digest();
  const requestDigest = `0x${digestBytes.toString("hex")}`;
  const signature = sign(null, digestBytes, privateKeys.get(agency.signerKeyId));
  const lines = entry.lines.map((line) => [
    line.accountCode,
    line.accountName,
    line.accountType,
    line.fundCode,
    line.programCode,
    line.projectSourceRecordId ? projectKeys.get(line.projectSourceRecordId) : ZeroHash,
    BigInt(line.debitCentavos),
    BigInt(line.creditCentavos),
  ]);
  const transaction = await ledger.getFunction("publishJournalEntry")(
    entry.agencyCode,
    entry.entryId,
    entry.postingDate,
    entry.description,
    entry.sourceDocumentId,
    entry.sourceUrl,
    agency.signerKeyId,
    requestDigest,
    signature,
    lines,
    { type: 0, gasPrice: 0, gasLimit: 3_000_000 },
  );
  const receipt = await transaction.wait(1);
  const key = await ledger.getFunction("entryKey")(entry.agencyCode, entry.entryId);
  journalTransactions.push({
    agencyCode: entry.agencyCode,
    entryId: entry.entryId,
    entryKey: key,
    requestDigest,
    signatureBase64: signature.toString("base64"),
    transactionHash: transaction.hash,
    blockNumber: receipt?.blockNumber ?? null,
  });
}

let unbalancedEntryRejected = false;
try {
  const sample = dataset.journalEntries[0];
  const agency = dataset.agencies.find((candidate) => candidate.code === sample.agencyCode);
  const digest = createHash("sha256").update("synthetic-unbalanced-rejection-test").digest();
  const signature = sign(null, digest, privateKeys.get(agency.signerKeyId));
  await ledger.getFunction("publishJournalEntry").staticCall(
    sample.agencyCode,
    "MOCK-UNBALANCED-REJECT-001",
    sample.postingDate,
    "Synthetic unbalanced entry that must be rejected",
    "MOCK-REJECT-001",
    sample.sourceUrl,
    agency.signerKeyId,
    `0x${digest.toString("hex")}`,
    signature,
    [
      ["TEST-DEBIT", "Synthetic Debit", "EXPENSE", "101", "TEST", ZeroHash, 100n, 0n],
      ["TEST-CREDIT", "Synthetic Credit", "ASSET", "101", "TEST", ZeroHash, 0n, 99n],
    ],
  );
} catch {
  unbalancedEntryRejected = true;
}

let localEnv = await readFile(localEnvPath, "utf8").catch(() => "");
const addressLine = `TOLVARIS_GENERAL_LEDGER_ADDRESS=${ledgerAddress}`;
if (/^TOLVARIS_GENERAL_LEDGER_ADDRESS=.*$/m.test(localEnv)) {
  localEnv = localEnv.replace(/^TOLVARIS_GENERAL_LEDGER_ADDRESS=.*$/m, addressLine);
} else {
  localEnv = `${localEnv.trimEnd()}\n${addressLine}\n`;
}
await writeFile(localEnvPath, localEnv, { mode: 0o600 });

const results = {
  generatedAt: new Date().toISOString(),
  datasetId: dataset.datasetId,
  chainId: network.chainId.toString(),
  explorerBaseUrl: "https://hackathon-explorer.e.gov.ph",
  transparencyRegistryAddress: transparencyAddress,
  generalLedgerAddress: ledgerAddress,
  generalLedgerDeploymentTransactionHash: ledger.deploymentTransaction()?.hash ?? null,
  publicKeys,
  agencyTransactions,
  projectTransactions,
  journalTransactions,
  checks: { unbalancedEntryRejected },
};
await writeFile(resultsPath, `${JSON.stringify(results, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({
  chainId: results.chainId,
  generalLedgerAddress: results.generalLedgerAddress,
  generalLedgerDeploymentTransactionHash: results.generalLedgerDeploymentTransactionHash,
  agenciesPublished: agencyTransactions.length,
  projectsPublished: projectTransactions.filter((item) => !item.alreadyExisted).length,
  journalEntriesPublished: journalTransactions.length,
  unbalancedEntryRejected,
  localResultsFile: ".local/mock-government-chain-results.json",
}, null, 2));
