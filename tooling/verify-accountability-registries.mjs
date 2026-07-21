import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, JsonRpcProvider } from "ethers";

const root = resolve(import.meta.dirname, "..");
const rpcUrl = process.env.EGOVCHAIN_RPC_URL?.trim();
if (!rpcUrl) throw new Error("EGOVCHAIN_RPC_URL is required");

const deployment = JSON.parse(await readFile(resolve(root, ".local/accountability-registry-results.json"), "utf8"));
const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
const expectedChainId = BigInt(process.env.EGOVCHAIN_CHAIN_ID || "13371");
const network = await provider.getNetwork();
if (network.chainId !== expectedChainId) throw new Error(`Unexpected chain ID ${network.chainId}`);

const benefit = new Contract(deployment.registries.benefit.address, [
  "function getProgram(bytes32) view returns (tuple(string benefitId,string title,string agencyCode,string description,string legalBasis,string legalBasisUrl,string[] eligibleGroupCodes,string[] acceptedCardTypes,bool active,uint64 recordedAt))",
  "function getEligibility(bytes32) view returns (tuple(bytes32 subjectCommitment,bytes32 benefitKey,bytes32 evidenceCommitment,string status,uint64 assessedAt))",
  "function getNotifications(bytes32) view returns (tuple(bytes32 notificationFingerprint,string channel,string deliveryStatus,uint64 recordedAt)[])",
], provider);
const report = new Contract(deployment.registries.report.address, [
  "function getReport(bytes32) view returns (tuple(bytes32 reportId,bytes32 reporterCommitment,bytes32 subjectCommitment,bytes32 evidenceDigest,string category,string assignedAgencyCode,string coarseLocation,string status,uint64 recordedAt))",
  "function getExternalEvidenceSignal(bytes32) view returns (tuple(bytes32 signalId,bytes32 projectKey,bytes32 sourceContentDigest,bytes32 normalizedClaimDigest,string sourceUrl,string sourcePublisher,string category,string status,uint64 recordedAt))",
], provider);
const payment = new Contract(deployment.registries.payment.address, [
  "function getProof(bytes32) view returns (tuple(bytes32 proofId,uint8 partyType,bytes32 partyCommitment,bytes32 transactionCommitment,bytes32 detailDigest,string publicBusinessName,string publicReference,uint256 publicAmountCentavos,string publicCurrency,string status,uint64 recordedAt))",
], provider);
const documentProof = new Contract(deployment.registries.documentProof.address, [
  "function getProof(bytes32) view returns (tuple(bytes32 documentId,bytes32 contentDigest,bytes32 subjectCommitment,bytes32 normalizedPayloadDigest,string schemaVersion,string documentType,string issuerAgencyCode,uint32 fiscalYear,uint8 visibility,string publicTitle,string publicSourceUrl,uint64 recordedAt))",
], provider);

const started = performance.now();
const [program, eligibility, notifications, reportRecord, mediaSignal, individualPayment, businessPayment, documentRecord] = await Promise.all([
  benefit.getFunction("getProgram")(deployment.records.benefitProgram.key),
  benefit.getFunction("getEligibility")(deployment.records.eligibility.key),
  benefit.getFunction("getNotifications")(deployment.records.eligibility.key),
  report.getFunction("getReport")(deployment.records.report.reportId),
  report.getFunction("getExternalEvidenceSignal")(deployment.records.mediaSignal.signalId),
  payment.getFunction("getProof")(deployment.records.individualPayment.proofId),
  payment.getFunction("getProof")(deployment.records.businessPayment.proofId),
  documentProof.getFunction("getProof")(deployment.records.document.documentId),
]);

const checks = {
  benefitProgramReadable: program.benefitId === "MOCK-SENIOR-SUPPORT-2026" && program.recordedAt > 0n,
  eligibilityPseudonymous: eligibility.status === "ELIGIBLE_FOR_AGENCY_REVIEW" && eligibility.assessedAt > 0n,
  notificationReceiptReadable: notifications.length === 1 && notifications[0].channel === "EMESSAGE",
  reportCommitmentReadable: reportRecord.category === "SERVICE_NON_DELIVERY" && reportRecord.recordedAt > 0n,
  mediaSignalMarkedUnverified: mediaSignal.status === "UNVERIFIED_MEDIA_SIGNAL" && mediaSignal.recordedAt > 0n,
  individualPaymentPrivate: individualPayment.partyType === 0n && individualPayment.publicBusinessName === "" && individualPayment.publicAmountCentavos === 0n,
  businessPaymentPublic: businessPayment.partyType === 1n && businessPayment.publicBusinessName === "Synthetic Community Supplier Inc." && businessPayment.publicAmountCentavos === 12500000n,
  publicDocumentReadable: documentRecord.visibility === 2n && documentRecord.publicTitle === "Synthetic Budget Release Document" && documentRecord.recordedAt > 0n,
  individualPlaintextRejected: deployment.checks.individualPlaintextRejected === true,
  privateDocumentPlaintextRejected: deployment.checks.privateDocumentPlaintextRejected === true,
};
const passed = Object.values(checks).filter(Boolean).length;
const total = Object.keys(checks).length;
const result = {
  generatedAt: new Date().toISOString(),
  kind: "accountability-registry-kpi",
  result: passed === total ? "PASS" : "FAIL",
  chainId: network.chainId.toString(),
  durationMs: Number((performance.now() - started).toFixed(2)),
  summary: { passed, total },
  checks,
  registries: deployment.registries,
  disclaimer: deployment.disclaimer,
};
const reportsDirectory = resolve(root, ".local/reports");
await mkdir(reportsDirectory, { recursive: true });
await writeFile(resolve(reportsDirectory, "accountability-registry-kpi-latest.json"), `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(result, null, 2));
if (result.result !== "PASS") process.exitCode = 1;
