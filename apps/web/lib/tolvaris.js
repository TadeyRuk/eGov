import { createHmac } from "node:crypto";
import { Contract, JsonRpcProvider, Wallet } from "ethers";

const REGISTRY_ABI = [
  "function anchorCard(bytes32 ownerCommitment,string cardType,bytes32 cardFingerprint)",
  "function isAnchored(bytes32 ownerCommitment,string cardType,bytes32 cardFingerprint) view returns (bool)",
  "function getCards(bytes32 ownerCommitment) view returns ((string cardType,bytes32 cardFingerprint,uint64 anchoredAt)[])",
];

function hmacHex(secret, value) {
  return `0x${createHmac("sha256", secret).update(value).digest("hex")}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function meaningful(value) {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

function ledgerConfig() {
  const rpcUrl = process.env.EGOVCHAIN_RPC_URL?.trim();
  const registryAddress = process.env.TOLVARIS_REGISTRY_ADDRESS?.trim();
  const hmacSecret = process.env.TOLVARIS_OWNER_HMAC_SECRET?.trim();
  return { rpcUrl, registryAddress, hmacSecret };
}

export function profileRoot(envelope) {
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return {};
  return envelope.data && typeof envelope.data === "object" && !Array.isArray(envelope.data)
    ? envelope.data
    : envelope;
}

export function ledgerIdentity(profile) {
  const { hmacSecret } = ledgerConfig();
  const subject = typeof profile.uniqid === "string" ? profile.uniqid.trim() : "";
  if (!hmacSecret || !subject) return null;

  const ownerCommitment = hmacHex(hmacSecret, `TOLVARIS|OWNER|${subject}`);
  const fields = [
    ["NATIONAL_ID", profile.national_id],
    ["TIN_ID", profile.tin_id],
    ["PASSPORT", profile.passport],
  ];
  const detectedCards = fields.flatMap(([cardType, value]) =>
    meaningful(value)
      ? [{
          cardType,
          cardFingerprint: hmacHex(
            hmacSecret,
            `TOLVARIS|CARD|${ownerCommitment}|${cardType}|${stableJson(value)}`,
          ),
        }]
      : [],
  );
  return { ownerCommitment, detectedCards };
}

function readContract() {
  const { rpcUrl, registryAddress } = ledgerConfig();
  if (!rpcUrl || !registryAddress) return null;
  return new Contract(registryAddress, REGISTRY_ABI, new JsonRpcProvider(rpcUrl));
}

export async function readLedgerCards(ownerCommitment) {
  const contract = readContract();
  if (!contract) return { configured: false, cards: [] };
  const cards = await contract.getCards(ownerCommitment);
  return {
    configured: true,
    cards: cards.map((card) => ({
      cardType: card.cardType,
      cardFingerprint: card.cardFingerprint,
      anchoredAt: Number(card.anchoredAt),
    })),
  };
}

export async function anchorDetectedCards(identity) {
  const { rpcUrl, registryAddress } = ledgerConfig();
  const privateKey = process.env.EGOVCHAIN_SIGNER_PRIVATE_KEY?.trim();
  if (!rpcUrl || !registryAddress || !privateKey) {
    return { configured: false, submitted: [] };
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const contract = new Contract(registryAddress, REGISTRY_ABI, new Wallet(privateKey, provider));
  const submitted = [];
  for (const card of identity.detectedCards) {
    const exists = await contract.isAnchored(
      identity.ownerCommitment,
      card.cardType,
      card.cardFingerprint,
    );
    if (exists) continue;
    const transaction = await contract.anchorCard(
      identity.ownerCommitment,
      card.cardType,
      card.cardFingerprint,
      { type: 0, gasPrice: 0 },
    );
    const receipt = await transaction.wait(1);
    submitted.push({
      cardType: card.cardType,
      transactionHash: transaction.hash,
      blockNumber: receipt?.blockNumber ?? null,
    });
  }
  return { configured: true, submitted };
}
