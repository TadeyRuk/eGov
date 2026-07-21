import type {
  EgovChainPort,
  JsonRpcRequest,
  JsonRpcSuccess,
} from "@egov/application";
import { appError, err, ok, type Result } from "@egov/shared";
import {
  DEFAULT_BASE_URLS,
  envOrDefault,
  platformFetch,
  type PlatformEnv,
} from "./http.js";

export function createEgovChainAdapter(env: PlatformEnv): EgovChainPort {
  const rpcUrl = () =>
    envOrDefault(env, "EGOVCHAIN_RPC_URL", DEFAULT_BASE_URLS.egovChain);

  async function call(
    request: JsonRpcRequest,
  ): Promise<Result<JsonRpcSuccess>> {
    const id = request.id ?? 1;
    const body = {
      jsonrpc: "2.0",
      method: request.method,
      params: request.params ?? [],
      id,
    };
    const res = await platformFetch(rpcUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return res;
    if ("error" in res.value.json && res.value.json.error != null) {
      return err(
        appError("VALIDATION", `JSON-RPC error for ${request.method}`, res.value.json.error),
      );
    }
    return ok({
      result: res.value.json.result,
      id: (res.value.json.id as string | number | null) ?? id,
      raw: res.value.json,
    });
  }

  return {
    call,
    ethCall(params) {
      return call({ method: "eth_call", params });
    },
    ethSendRawTransaction(signedTx) {
      return call({ method: "eth_sendRawTransaction", params: [signedTx] });
    },
    ethGetTransactionReceipt(txHash) {
      return call({ method: "eth_getTransactionReceipt", params: [txHash] });
    },
    ethBlockNumber() {
      return call({ method: "eth_blockNumber", params: [] });
    },
    ethGetBalance(address, block = "latest") {
      return call({ method: "eth_getBalance", params: [address, block] });
    },
  };
}
