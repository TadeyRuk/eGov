import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, JsonRpcProvider } from "ethers";

const repositoryRoot = resolve(import.meta.dirname, "..");
const dataset = JSON.parse(await readFile(resolve(repositoryRoot, "data/mock-government-ledger.json"), "utf8"));
const chainResults = JSON.parse(await readFile(resolve(repositoryRoot, ".local/mock-government-chain-results.json"), "utf8"));
const rpcUrl = process.env.EGOVCHAIN_RPC_URL?.trim();
if (!rpcUrl) throw new Error("EGOVCHAIN_RPC_URL is required");
const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
const ledger = new Contract(chainResults.generalLedgerAddress, [
  "function entryKey(string agencyCode,string entryId) pure returns (bytes32)",
  "function getEntry(bytes32 key) view returns ((string agencyCode,string entryId,string postingDate,string description,string sourceDocumentId,string sourceUrl,string signerKeyId,bytes32 requestDigest,bytes signature,uint256 totalDebitCentavos,uint256 totalCreditCentavos,uint64 recordedAt,bool exists))",
  "function getLines(bytes32 key) view returns ((string accountCode,string accountName,string accountType,string fundCode,string programCode,bytes32 projectKey,uint256 debitCentavos,uint256 creditCentavos)[])"
], provider);
const transparency = new Contract(chainResults.transparencyRegistryAddress, [
  "function projectKey(string dataset,string sourceRecordId) pure returns (bytes32)",
  "function getProject(bytes32 key) view returns ((string dataset,string sourceRecordId,string title,string location,string agencyCode,string implementingUnit,string sourceUrl,bytes32 projectFingerprint,bool exists))",
  "function getBudgetSnapshots(bytes32 key) view returns ((uint32 fiscalYear,string asOfDate,uint256 appropriationsCentavos,uint256 allotmentsCentavos,uint256 obligationsCentavos,uint256 disbursementsCentavos,string status,bytes32 sourcePayloadHash,uint64 recordedAt)[])"
], provider);

const accountBalances = new Map();
const journalEntries = [];
let totalDebit = 0n;
let totalCredit = 0n;
for (const sourceEntry of dataset.journalEntries) {
  const key = await ledger.getFunction("entryKey")(sourceEntry.agencyCode, sourceEntry.entryId);
  const entry = await ledger.getFunction("getEntry")(key);
  const lines = await ledger.getFunction("getLines")(key);
  const debit = BigInt(entry.totalDebitCentavos);
  const credit = BigInt(entry.totalCreditCentavos);
  totalDebit += debit;
  totalCredit += credit;
  const publicLines = lines.map((line) => {
    const accountKey = `${entry.agencyCode}|${line.accountCode}|${line.accountType}`;
    const previous = accountBalances.get(accountKey) || {
      agencyCode: entry.agencyCode,
      accountCode: line.accountCode,
      accountName: line.accountName,
      accountType: line.accountType,
      debitCentavos: 0n,
      creditCentavos: 0n,
    };
    previous.debitCentavos += BigInt(line.debitCentavos);
    previous.creditCentavos += BigInt(line.creditCentavos);
    accountBalances.set(accountKey, previous);
    return {
      accountCode: line.accountCode,
      accountName: line.accountName,
      accountType: line.accountType,
      debitCentavos: line.debitCentavos.toString(),
      creditCentavos: line.creditCentavos.toString(),
      projectKey: line.projectKey,
    };
  });
  journalEntries.push({
    entryKey: key,
    agencyCode: entry.agencyCode,
    entryId: entry.entryId,
    postingDate: entry.postingDate,
    description: entry.description,
    signerKeyId: entry.signerKeyId,
    requestDigest: entry.requestDigest,
    totalDebitCentavos: debit.toString(),
    totalCreditCentavos: credit.toString(),
    balanced: debit === credit,
    recordedAt: Number(entry.recordedAt),
    lines: publicLines,
  });
}

const balances = [...accountBalances.values()].map((account) => {
  const debitNormal = account.accountType === "ASSET" || account.accountType === "EXPENSE";
  const balance = debitNormal
    ? account.debitCentavos - account.creditCentavos
    : account.creditCentavos - account.debitCentavos;
  return {
    ...account,
    debitCentavos: account.debitCentavos.toString(),
    creditCentavos: account.creditCentavos.toString(),
    balanceCentavos: balance.toString(),
  };
});
const sumType = (type) => balances
  .filter((account) => account.accountType === type)
  .reduce((sum, account) => sum + BigInt(account.balanceCentavos), 0n);
const assets = sumType("ASSET");
const liabilities = sumType("LIABILITY");
const equity = sumType("EQUITY");
const revenue = sumType("REVENUE");
const expense = sumType("EXPENSE");
const equationRight = liabilities + equity + revenue - expense;

const projects = [];
const anomalies = [];
for (const sourceProject of dataset.projects) {
  const key = await transparency.getFunction("projectKey")(
    sourceProject.dataset,
    sourceProject.sourceRecordId,
  );
  const project = await transparency.getFunction("getProject")(key);
  const snapshots = await transparency.getFunction("getBudgetSnapshots")(key);
  const snapshot = snapshots.at(-1);
  if (!snapshot) throw new Error(`No snapshot for ${sourceProject.sourceRecordId}`);
  const appropriation = BigInt(snapshot.appropriationsCentavos);
  const allotment = BigInt(snapshot.allotmentsCentavos);
  const obligation = BigInt(snapshot.obligationsCentavos);
  const disbursement = BigInt(snapshot.disbursementsCentavos);
  const utilizationPercent = allotment === 0n
    ? 0
    : Number(((disbursement * 10_000n) / allotment)) / 100;
  const projectResult = {
    projectKey: key,
    dataset: project.dataset,
    sourceRecordId: project.sourceRecordId,
    title: project.title,
    location: project.location,
    agencyCode: project.agencyCode,
    fiscalYear: Number(snapshot.fiscalYear),
    asOfDate: snapshot.asOfDate,
    appropriationsCentavos: appropriation.toString(),
    allotmentsCentavos: allotment.toString(),
    obligationsCentavos: obligation.toString(),
    disbursementsCentavos: disbursement.toString(),
    utilizationPercent,
    status: snapshot.status,
    sourcePayloadHash: snapshot.sourcePayloadHash,
  };
  projects.push(projectResult);
  if (obligation > allotment) {
    anomalies.push({
      severity: "high",
      rule: "OBLIGATION_EXCEEDS_ALLOTMENT",
      projectKey: key,
      sourceRecordId: project.sourceRecordId,
      detail: "Obligations are greater than allotments in the published snapshot.",
      legalStatus: "REVIEW_SIGNAL_NOT_A_LEGAL_FINDING",
    });
  }
  if (disbursement > obligation) {
    anomalies.push({
      severity: "high",
      rule: "DISBURSEMENT_EXCEEDS_OBLIGATION",
      projectKey: key,
      sourceRecordId: project.sourceRecordId,
      detail: "Disbursements are greater than obligations in the published snapshot.",
      legalStatus: "REVIEW_SIGNAL_NOT_A_LEGAL_FINDING",
    });
  }
  if (disbursement > allotment) {
    anomalies.push({
      severity: "high",
      rule: "DISBURSEMENT_EXCEEDS_ALLOTMENT",
      projectKey: key,
      sourceRecordId: project.sourceRecordId,
      detail: "Disbursements are greater than allotments in the published snapshot.",
      legalStatus: "REVIEW_SIGNAL_NOT_A_LEGAL_FINDING",
    });
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  datasetId: dataset.datasetId,
  isSynthetic: true,
  disclaimer: dataset.disclaimer,
  chain: {
    chainId: chainResults.chainId,
    explorerBaseUrl: chainResults.explorerBaseUrl,
    transparencyRegistryAddress: chainResults.transparencyRegistryAddress,
    generalLedgerAddress: chainResults.generalLedgerAddress,
    generalLedgerDeploymentTransactionHash: chainResults.generalLedgerDeploymentTransactionHash,
  },
  kpis: {
    agencies: dataset.agencies.length,
    projects: projects.length,
    journalEntries: journalEntries.length,
    journalLines: journalEntries.reduce((sum, entry) => sum + entry.lines.length, 0),
    totalDebitCentavos: totalDebit.toString(),
    totalCreditCentavos: totalCredit.toString(),
    trialBalanceDifferenceCentavos: (totalDebit - totalCredit).toString(),
    balancedJournalEntries: journalEntries.filter((entry) => entry.balanced).length,
    anomalyCount: anomalies.length,
  },
  accountingEquation: {
    assetsCentavos: assets.toString(),
    liabilitiesCentavos: liabilities.toString(),
    equityCentavos: equity.toString(),
    revenueCentavos: revenue.toString(),
    expenseCentavos: expense.toString(),
    rightSideCentavos: equationRight.toString(),
    differenceCentavos: (assets - equationRight).toString(),
    balanced: assets === equationRight,
  },
  projects,
  journalEntries,
  accountBalances: balances,
  anomalies,
  provenance: {
    publicKeys: chainResults.publicKeys,
    projectTransactions: chainResults.projectTransactions,
    journalTransactions: chainResults.journalTransactions,
    checks: chainResults.checks,
  },
};

const outputPath = resolve(repositoryRoot, ".local/mock-government-analytics.json");
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify({
  result: report.kpis.trialBalanceDifferenceCentavos === "0" && report.accountingEquation.balanced ? "PASS" : "FAIL",
  kpis: report.kpis,
  accountingEquation: report.accountingEquation,
  anomalies: report.anomalies,
  localReportFile: ".local/mock-government-analytics.json",
}, null, 2));
