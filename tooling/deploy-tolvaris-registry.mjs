import { randomBytes, createHmac } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import solc from "solc";
import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";

const repositoryRoot = resolve(import.meta.dirname, "..");
const sourcePath = resolve(repositoryRoot, "contracts/TolvarisCardRegistry.sol");
const localEnvPath = resolve(repositoryRoot, ".local/tolvaris-registry.env");
const rpcUrl = process.env.EGOVCHAIN_RPC_URL?.trim();
const expectedChainId = BigInt(process.env.EGOVCHAIN_CHAIN_ID || "13371");
if (!rpcUrl) throw new Error("EGOVCHAIN_RPC_URL is required");

const source = await readFile(sourcePath, "utf8");
const compilerInput = {
  language: "Solidity",
  sources: { "TolvarisCardRegistry.sol": { content: source } },
  settings: {
    evmVersion: "paris",
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const compiled = JSON.parse(solc.compile(JSON.stringify(compilerInput)));
const errors = (compiled.errors || []).filter((entry) => entry.severity === "error");
if (errors.length > 0) throw new Error(errors.map((entry) => entry.formattedMessage).join("\n"));
const artifact = compiled.contracts["TolvarisCardRegistry.sol"].TolvarisCardRegistry;

const privateKey = process.env.EGOVCHAIN_SIGNER_PRIVATE_KEY?.trim() || Wallet.createRandom().privateKey;
const ownerHmacSecret = process.env.TOLVARIS_OWNER_HMAC_SECRET?.trim() || randomBytes(32).toString("hex");
const provider = new JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
const network = await provider.getNetwork();
if (network.chainId !== expectedChainId) throw new Error(`Unexpected chain ID ${network.chainId}`);

const signer = new Wallet(privateKey, provider);
const factory = new ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, signer);
const contract = await factory.deploy({ type: 0, gasPrice: 0, gasLimit: 3_000_000 });
await contract.waitForDeployment();
const address = await contract.getAddress();
const deployment = contract.deploymentTransaction();

const syntheticOwner = `0x${createHmac("sha256", ownerHmacSecret).update("synthetic-egov-user-001").digest("hex")}`;
const syntheticFingerprint = `0x${createHmac("sha256", ownerHmacSecret).update("synthetic-egov-user-001|NATIONAL_ID|sample-only").digest("hex")}`;
const anchorTransaction = await contract.anchorCard(
  syntheticOwner,
  "NATIONAL_ID",
  syntheticFingerprint,
  { type: 0, gasPrice: 0 },
);
const anchorReceipt = await anchorTransaction.wait(1);
const cards = await contract.getCards(syntheticOwner);

await mkdir(dirname(localEnvPath), { recursive: true });
await writeFile(
  localEnvPath,
  [
    `EGOVCHAIN_SIGNER_PRIVATE_KEY=${privateKey}`,
    `TOLVARIS_OWNER_HMAC_SECRET=${ownerHmacSecret}`,
    `TOLVARIS_REGISTRY_ADDRESS=${address}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);

console.log(JSON.stringify({
  chainId: network.chainId.toString(),
  registryAddress: address,
  registrar: signer.address,
  deploymentTransactionHash: deployment?.hash ?? null,
  syntheticAnchorTransactionHash: anchorTransaction.hash,
  syntheticAnchorBlock: anchorReceipt?.blockNumber ?? null,
  syntheticReadBack: cards.map((card) => ({
    cardType: card.cardType,
    cardFingerprint: card.cardFingerprint,
    anchoredAt: Number(card.anchoredAt),
  })),
  localSecretsFile: ".local/tolvaris-registry.env",
}, null, 2));
