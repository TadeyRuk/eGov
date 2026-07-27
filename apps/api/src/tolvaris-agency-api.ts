import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";
import { Contract, JsonRpcProvider, Wallet } from "ethers";

const REGISTRY_ABI = [
  "function hasProject(string dataset,string sourceRecordId) view returns (bool)",
  "function projectFingerprint(string dataset,string agencyCode,string canonicalTitle,string canonicalLocation) pure returns (bytes32)",
  "function findProjectByFingerprint(bytes32 fingerprint) view returns (bytes32 key,bool exists)",
  "function publishProject(string dataset,string sourceRecordId,string title,string location,string agencyCode,string implementingUnit,string sourceUrl) returns (bytes32 key)",
  "function publishBudgetSnapshot(bytes32 key,uint32 fiscalYear,string asOfDate,uint256 appropriationsCentavos,uint256 allotmentsCentavos,uint256 obligationsCentavos,uint256 disbursementsCentavos,string status,bytes32 sourcePayloadHash)",
  "function projectKey(string dataset,string sourceRecordId) pure returns (bytes32)",
];

type AgencyKey = {
  readonly agencyCode: string;
  readonly publicKeyPem: string;
};

export type AgencyProjectInput = {
  readonly dataset: string;
  readonly sourceRecordId: string;
  readonly title: string;
  readonly location: string;
  readonly agencyCode: string;
  readonly implementingUnit: string;
  readonly sourceUrl: string;
  readonly budget?: {
    readonly fiscalYear: number;
    readonly asOfDate: string;
    readonly appropriationsCentavos: string;
    readonly allotmentsCentavos: string;
    readonly obligationsCentavos: string;
    readonly disbursementsCentavos: string;
    readonly status: string;
  };
};

export type AgencySignatureHeaders = {
  readonly keyId: string;
  readonly timestamp: string;
  readonly nonce: string;
  readonly signature: string;
};

type VerificationSuccess = { readonly ok: true; readonly agency: AgencyKey };
type VerificationFailure = {
  readonly ok: false;
  readonly status: number;
  readonly message: string;
};
type VerificationResult = VerificationSuccess | VerificationFailure;

function isVerificationFailure(
  result: VerificationResult,
): result is VerificationFailure {
  return result.ok === false;
}

const usedNonces = new Map<string, number>();
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

function canonicalText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function signingMessage(
  method: string,
  path: string,
  timestamp: string,
  nonce: string,
  rawBody: string,
): string {
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  return [timestamp, nonce, method.toUpperCase(), path, bodyHash].join("\n");
}

function parseAgencyKeys(raw: string | undefined): Readonly<Record<string, AgencyKey>> {
  if (!raw?.trim()) return {};
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(parsed).flatMap(([keyId, value]) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const agencyCode = (value as { agencyCode?: unknown }).agencyCode;
    const publicKeyPem = (value as { publicKeyPem?: unknown }).publicKeyPem;
    return typeof agencyCode === "string" && typeof publicKeyPem === "string"
      ? [[keyId, { agencyCode: canonicalText(agencyCode), publicKeyPem }]]
      : [];
  }));
}

export function verifyAgencyRequest(input: {
  readonly method: string;
  readonly path: string;
  readonly rawBody: string;
  readonly headers: AgencySignatureHeaders;
  readonly agencyKeys: Readonly<Record<string, AgencyKey>>;
  readonly now?: number;
  readonly consumeNonce?: boolean;
}): VerificationResult {
  const agency = input.agencyKeys[input.headers.keyId];
  if (!agency) return { ok: false, status: 401, message: "Unknown agency key" };
  const requestTime = Date.parse(input.headers.timestamp);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(requestTime) || Math.abs(now - requestTime) > MAX_CLOCK_SKEW_MS) {
    return { ok: false, status: 401, message: "Expired or invalid request timestamp" };
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.headers.nonce)) {
    return { ok: false, status: 401, message: "Invalid request nonce" };
  }

  for (const [key, expiresAt] of usedNonces) {
    if (expiresAt <= now) usedNonces.delete(key);
  }
  const nonceKey = `${input.headers.keyId}:${input.headers.nonce}`;
  if (usedNonces.has(nonceKey)) {
    return { ok: false, status: 409, message: "Request nonce was already used" };
  }

  try {
    const valid = verifySignature(
      null,
      Buffer.from(signingMessage(
        input.method,
        input.path,
        input.headers.timestamp,
        input.headers.nonce,
        input.rawBody,
      )),
      createPublicKey(agency.publicKeyPem),
      Buffer.from(input.headers.signature, "base64"),
    );
    if (!valid) return { ok: false, status: 401, message: "Invalid request signature" };
  } catch {
    return { ok: false, status: 401, message: "Invalid request signature" };
  }

  if (input.consumeNonce !== false) usedNonces.set(nonceKey, now + MAX_CLOCK_SKEW_MS);
  return { ok: true, agency };
}

function validateProject(value: unknown): AgencyProjectInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const required = [
    "dataset",
    "sourceRecordId",
    "title",
    "location",
    "agencyCode",
    "implementingUnit",
    "sourceUrl",
  ] as const;
  if (required.some((key) => typeof body[key] !== "string" || !String(body[key]).trim())) {
    return null;
  }
  return body as unknown as AgencyProjectInput;
}

export async function publishSignedAgencyProject(input: {
  readonly rawBody: string;
  readonly parsedBody: unknown;
  readonly headers: AgencySignatureHeaders;
  readonly correlationId: string;
}): Promise<{ readonly status: number; readonly body: unknown }> {
  const startedAt = performance.now();
  let agencyKeys: Readonly<Record<string, AgencyKey>>;
  try {
    agencyKeys = parseAgencyKeys(process.env.TOLVARIS_AGENCY_PUBLIC_KEYS_JSON);
  } catch {
    return { status: 503, body: { error: "Agency public-key configuration is invalid" } };
  }
  const verified = verifyAgencyRequest({
    method: "POST",
    path: "/tolvaris/projects",
    rawBody: input.rawBody,
    headers: input.headers,
    agencyKeys,
  });
  if (isVerificationFailure(verified)) {
    console.warn(JSON.stringify({
      level: "warn",
      event: "tolvaris_agency_auth",
      correlationId: input.correlationId,
      keyId: input.headers.keyId,
      status: "rejected",
      reason: verified.message,
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
    }));
    return { status: verified.status, body: { error: verified.message } };
  }

  const project = validateProject(input.parsedBody);
  if (!project) return { status: 400, body: { error: "Invalid project payload" } };
  const agencyCode = canonicalText(project.agencyCode);
  if (agencyCode !== verified.agency.agencyCode) {
    return { status: 403, body: { error: "Agency key cannot publish for this agency code" } };
  }

  const rpcUrl = process.env.EGOVCHAIN_RPC_URL?.trim();
  const address = process.env.TOLVARIS_TRANSPARENCY_REGISTRY_ADDRESS?.trim();
  const privateKey = process.env.EGOVCHAIN_SIGNER_PRIVATE_KEY?.trim();
  if (!rpcUrl || !address || !privateKey) {
    return { status: 503, body: { error: "Tolvaris publisher is not configured" } };
  }

  const normalized = {
    dataset: canonicalText(project.dataset),
    sourceRecordId: project.sourceRecordId.trim(),
    title: canonicalText(project.title),
    location: canonicalText(project.location),
    agencyCode,
    implementingUnit: canonicalText(project.implementingUnit),
    sourceUrl: project.sourceUrl.trim(),
  };
  const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
  const contract = new Contract(address, REGISTRY_ABI, new Wallet(privateKey, provider));

  try {
    const exactStarted = performance.now();
    const exactExists = await contract.getFunction("hasProject")(
      normalized.dataset,
      normalized.sourceRecordId,
    );
    const exactLookupMs = Number((performance.now() - exactStarted).toFixed(2));
    if (exactExists) {
      return { status: 409, body: { error: "Exact DBM source record already exists", duplicateType: "exact", metrics: { exactLookupMs } } };
    }

    const fingerprint = await contract.getFunction("projectFingerprint")(
      normalized.dataset,
      normalized.agencyCode,
      normalized.title,
      normalized.location,
    );
    const fingerprintStarted = performance.now();
    const contextual = await contract.getFunction("findProjectByFingerprint")(fingerprint);
    const fingerprintLookupMs = Number((performance.now() - fingerprintStarted).toFixed(2));
    if (contextual.exists) {
      return {
        status: 409,
        body: {
          error: "Contextually equivalent project already exists",
          duplicateType: "contextual",
          existingProjectKey: contextual.key,
          metrics: { exactLookupMs, fingerprintLookupMs },
        },
      };
    }

    const publishStarted = performance.now();
    const transaction = await contract.getFunction("publishProject")(
      normalized.dataset,
      normalized.sourceRecordId,
      normalized.title,
      normalized.location,
      normalized.agencyCode,
      normalized.implementingUnit,
      normalized.sourceUrl,
      { type: 0, gasPrice: 0 },
    );
    const receipt = await transaction.wait(1);
    const publishMs = Number((performance.now() - publishStarted).toFixed(2));
    const projectKey = await contract.getFunction("projectKey")(
      normalized.dataset,
      normalized.sourceRecordId,
    );
    let snapshotTransactionHash: string | undefined;

    if (project.budget) {
      const payloadHash = `0x${createHash("sha256").update(input.rawBody).digest("hex")}`;
      const snapshot = project.budget;
      const snapshotTransaction = await contract.getFunction("publishBudgetSnapshot")(
        projectKey,
        snapshot.fiscalYear,
        snapshot.asOfDate,
        BigInt(snapshot.appropriationsCentavos),
        BigInt(snapshot.allotmentsCentavos),
        BigInt(snapshot.obligationsCentavos),
        BigInt(snapshot.disbursementsCentavos),
        canonicalText(snapshot.status),
        payloadHash,
        { type: 0, gasPrice: 0 },
      );
      await snapshotTransaction.wait(1);
      snapshotTransactionHash = snapshotTransaction.hash;
    }

    const totalDurationMs = Number((performance.now() - startedAt).toFixed(2));
    console.log(JSON.stringify({
      level: "info",
      event: "tolvaris_project_published",
      correlationId: input.correlationId,
      keyId: input.headers.keyId,
      agencyCode,
      projectKey,
      transactionHash: transaction.hash,
      totalDurationMs,
    }));
    return {
      status: 201,
      body: {
        published: true,
        projectKey,
        transactionHash: transaction.hash,
        blockNumber: receipt?.blockNumber ?? null,
        ...(snapshotTransactionHash ? { snapshotTransactionHash } : {}),
        metrics: { exactLookupMs, fingerprintLookupMs, publishMs, totalDurationMs },
      },
    };
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "tolvaris_project_publish_failed",
      correlationId: input.correlationId,
      keyId: input.headers.keyId,
      agencyCode,
      errorType: error instanceof Error ? error.name : "UnknownError",
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
    }));
    return { status: 502, body: { error: "Tolvaris blockchain submission failed" } };
  }
}
