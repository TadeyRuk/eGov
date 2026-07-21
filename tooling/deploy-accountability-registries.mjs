import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import solc from "solc";
import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";

const root = resolve(import.meta.dirname, "..");
const localEnvPath = resolve(root, ".local/tolvaris-registry.env");
const resultsPath = resolve(root, ".local/accountability-registry-results.json");
const rpcUrl = process.env.EGOVCHAIN_RPC_URL?.trim();
const privateKey = process.env.EGOVCHAIN_SIGNER_PRIVATE_KEY?.trim();
const expectedChainId = BigInt(process.env.EGOVCHAIN_CHAIN_ID || "13371");
if (!rpcUrl || !privateKey) throw new Error("EGOVCHAIN_RPC_URL and EGOVCHAIN_SIGNER_PRIVATE_KEY are required");

const files = [
  "TolvarisBenefitRegistry.sol",
  "TolvarisReportRegistry.sol",
  "TolvarisPaymentProofRegistry.sol",
  "TolvarisDocumentProofRegistry.sol",
];
const sources = Object.fromEntries(await Promise.all(files.map(async (file) => [file, { content: await readFile(resolve(root, "contracts", file), "utf8") }])));
const output = JSON.parse(solc.compile(JSON.stringify({
  language: "Solidity",
  sources,
  settings: {
    evmVersion: "paris",
    viaIR: true,
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
})));
const errors = (output.errors || []).filter((entry) => entry.severity === "error");
if (errors.length) throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));

const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
const network = await provider.getNetwork();
if (network.chainId !== expectedChainId) throw new Error(`Unexpected chain ID ${network.chainId}`);
const signer = new Wallet(privateKey, provider);
const sha = (value) => `0x${createHash("sha256").update(value).digest("hex")}`;

async function deploy(file, contractName) {
  const artifact = output.contracts[file][contractName];
  const contract = await new ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, signer).deploy({ type: 0, gasPrice: 0, gasLimit: 7_000_000 });
  const receipt = await contract.deploymentTransaction().wait(1);
  return { contract, address: await contract.getAddress(), transactionHash: contract.deploymentTransaction().hash, blockNumber: receipt?.blockNumber ?? null };
}

const benefit = await deploy(files[0], "TolvarisBenefitRegistry");
const report = await deploy(files[1], "TolvarisReportRegistry");
const payment = await deploy(files[2], "TolvarisPaymentProofRegistry");
const documentProof = await deploy(files[3], "TolvarisDocumentProofRegistry");

const programTransaction = await benefit.contract.publishProgram([
  "MOCK-SENIOR-SUPPORT-2026",
  "Synthetic Senior Citizen Support",
  "DSWD-MOCK",
  "Synthetic benefit used only to demonstrate normalized eligibility and notification receipts.",
  "Republic Act No. 9994 (illustrative legal-basis reference; agency rules still control eligibility)",
  "https://elibrary.judiciary.gov.ph/thebookshelf/showdocs/2/17035",
  ["SENIOR_CITIZEN"],
  ["SENIOR_CITIZEN_ID", "NATIONAL_ID"],
  true,
  0,
], { type: 0, gasPrice: 0 });
await programTransaction.wait(1);
const programKey = await benefit.contract.benefitKey("DSWD-MOCK", "MOCK-SENIOR-SUPPORT-2026");
const subjectCommitment = sha("synthetic-beneficiary-001");
const eligibilityTransaction = await benefit.contract.recordEligibility(subjectCommitment, programKey, sha("synthetic-eligibility-evidence-v1"), "ELIGIBLE_FOR_AGENCY_REVIEW", { type: 0, gasPrice: 0 });
await eligibilityTransaction.wait(1);
const eligibilityKey = await benefit.contract.eligibilityKey(subjectCommitment, programKey);
const notificationTransaction = await benefit.contract.recordNotification(eligibilityKey, sha("synthetic-emessage-receipt-001"), "EMESSAGE", "QUEUED_SYNTHETIC", { type: 0, gasPrice: 0 });
await notificationTransaction.wait(1);

const reportId = sha("synthetic-ereport-001");
const reportTransaction = await report.contract.publishReport([
  reportId,
  sha("synthetic-reporter-001"),
  sha("synthetic-reported-subject-001"),
  sha("synthetic-report-evidence-001"),
  "SERVICE_NON_DELIVERY",
  "DSWD-MOCK",
  "Demo Social Protection Region",
  "RECEIVED",
  0,
], { type: 0, gasPrice: 0 });
await reportTransaction.wait(1);

const mediaSignalId = sha("synthetic-media-review-signal-001");
const mediaSignalTransaction = await report.contract.publishExternalEvidenceSignal([
  mediaSignalId,
  sha("synthetic-project-key-for-media-signal"),
  sha("synthetic-news-source-content"),
  sha("synthetic-normalized-claim"),
  "https://www.gmanetwork.com/news/rss/",
  "GMA News Online (source-feed demonstration only)",
  "AUDIT_REVIEW",
  "UNVERIFIED_MEDIA_SIGNAL",
  0,
], { type: 0, gasPrice: 0 });
await mediaSignalTransaction.wait(1);

const individualProofId = sha("synthetic-egovpay-individual-proof-001");
const individualTransaction = await payment.contract.publishProof([
  individualProofId, 0, subjectCommitment, sha("synthetic-individual-transaction-001"), sha("synthetic-individual-detail-vault-row-001"), "", "", 0, "", "PAID_SYNTHETIC", 0,
], { type: 0, gasPrice: 0 });
await individualTransaction.wait(1);

const businessProofId = sha("synthetic-egovpay-business-proof-001");
const businessTransaction = await payment.contract.publishProof([
  businessProofId, 1, sha("synthetic-business-registration-001"), sha("synthetic-business-transaction-001"), sha("synthetic-business-detail-v1"), "Synthetic Community Supplier Inc.", "MOCK-PAY-2026-001", 12500000, "PHP", "PAID_SYNTHETIC", 0,
], { type: 0, gasPrice: 0 });
await businessTransaction.wait(1);

let individualPlaintextRejected = false;
try {
  await payment.contract.publishProof.staticCall([
    sha("synthetic-invalid-private-payment"), 0, subjectCommitment, sha("synthetic-invalid-tx"), sha("synthetic-invalid-detail"), "MUST NOT APPEAR", "PRIVATE-REF", 1, "PHP", "PAID", 0,
  ]);
} catch { individualPlaintextRejected = true; }

const documentId = sha("synthetic-public-government-document-001");
const documentTransaction = await documentProof.contract.publishProof([
  documentId,
  sha("synthetic-document-bytes-001"),
  sha("synthetic-government-document-subject"),
  sha("synthetic-normalized-document-v1"),
  "1.0",
  "BUDGET_RELEASE",
  "DBM-MOCK",
  2026,
  2,
  "Synthetic Budget Release Document",
  "https://dbm.gov.ph/",
  0,
], { type: 0, gasPrice: 0 });
await documentTransaction.wait(1);

let privateDocumentPlaintextRejected = false;
try {
  await documentProof.contract.publishProof.staticCall([
    sha("synthetic-private-tax-document-invalid"), sha("synthetic-private-tax-bytes"), subjectCommitment, sha("synthetic-private-tax-normalized"), "1.0", "TAX_RETURN", "BIR-MOCK", 2026, 0, "MUST NOT APPEAR", "https://example.test/private", 0,
  ]);
} catch { privateDocumentPlaintextRejected = true; }

const results = {
  generatedAt: new Date().toISOString(),
  isSynthetic: true,
  disclaimer: "All records and entities are synthetic hackathon demonstration data, not claims about real people, businesses, or government activity.",
  chainId: network.chainId.toString(),
  explorerBaseUrl: "https://hackathon-explorer.e.gov.ph",
  registries: {
    benefit: { address: benefit.address, deploymentTransactionHash: benefit.transactionHash, blockNumber: benefit.blockNumber },
    report: { address: report.address, deploymentTransactionHash: report.transactionHash, blockNumber: report.blockNumber },
    payment: { address: payment.address, deploymentTransactionHash: payment.transactionHash, blockNumber: payment.blockNumber },
    documentProof: { address: documentProof.address, deploymentTransactionHash: documentProof.transactionHash, blockNumber: documentProof.blockNumber },
  },
  records: {
    benefitProgram: { key: programKey, transactionHash: programTransaction.hash },
    eligibility: { key: eligibilityKey, transactionHash: eligibilityTransaction.hash },
    notification: { transactionHash: notificationTransaction.hash },
    report: { reportId, transactionHash: reportTransaction.hash },
    mediaSignal: { signalId: mediaSignalId, transactionHash: mediaSignalTransaction.hash },
    individualPayment: { proofId: individualProofId, transactionHash: individualTransaction.hash },
    businessPayment: { proofId: businessProofId, transactionHash: businessTransaction.hash },
    document: { documentId, transactionHash: documentTransaction.hash },
  },
  checks: { individualPlaintextRejected, privateDocumentPlaintextRejected },
};
await writeFile(resultsPath, `${JSON.stringify(results, null, 2)}\n`, { mode: 0o600 });

let localEnv = await readFile(localEnvPath, "utf8").catch(() => "");
const envValues = {
  TOLVARIS_BENEFIT_REGISTRY_ADDRESS: benefit.address,
  TOLVARIS_REPORT_REGISTRY_ADDRESS: report.address,
  TOLVARIS_PAYMENT_PROOF_REGISTRY_ADDRESS: payment.address,
  TOLVARIS_DOCUMENT_PROOF_REGISTRY_ADDRESS: documentProof.address,
};
for (const [key, value] of Object.entries(envValues)) {
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");
  localEnv = pattern.test(localEnv) ? localEnv.replace(pattern, line) : `${localEnv.trimEnd()}\n${line}\n`;
}
await writeFile(localEnvPath, localEnv, { mode: 0o600 });
console.log(JSON.stringify({ chainId: results.chainId, registries: results.registries, records: Object.keys(results.records).length, individualPlaintextRejected, privateDocumentPlaintextRejected, localResultsFile: ".local/accountability-registry-results.json" }, null, 2));
