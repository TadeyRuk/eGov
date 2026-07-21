import type {
  DbmCompassPort,
  EgovAiPort,
  EgovChainPort,
  EgovPayPort,
  EgovSsoPort,
  EMessagePort,
  EReportPort,
  EVerifyPort,
  FaceLivenessPort,
} from "@egov/application";
import { createDbmCompassAdapter } from "./dbm-compass.js";
import { createEgovAiAdapter } from "./egov-ai.js";
import { createEgovChainAdapter } from "./egov-chain.js";
import { createEgovPayAdapter } from "./egov-pay.js";
import { createEMessageAdapter } from "./emessage.js";
import { createEReportAdapter } from "./ereport.js";
import { createEVerifyAdapter } from "./everify.js";
import { createFaceLivenessAdapter } from "./face-liveness.js";
import { processEnv, type PlatformEnv } from "./http.js";
import { createEgovSsoAdapter } from "./sso.js";

export {
  DEFAULT_BASE_URLS,
  processEnv,
  requireEnv,
  requireEnvAny,
  type PlatformEnv,
} from "./http.js";

export type EgovPlatformAdapters = {
  readonly sso: EgovSsoPort;
  readonly everify: EVerifyPort;
  readonly faceLiveness: FaceLivenessPort;
  readonly emessage: EMessagePort;
  readonly egovAi: EgovAiPort;
  readonly egovPay: EgovPayPort;
  readonly egovChain: EgovChainPort;
  readonly eReport: EReportPort;
  readonly dbmCompass: DbmCompassPort;
};

/** Wire all official eGov platform outbound adapters from env. */
export function createEgovPlatformAdapters(
  env: PlatformEnv = processEnv(),
): EgovPlatformAdapters {
  return {
    sso: createEgovSsoAdapter(env),
    everify: createEVerifyAdapter(env),
    faceLiveness: createFaceLivenessAdapter(env),
    emessage: createEMessageAdapter(env),
    egovAi: createEgovAiAdapter(env),
    egovPay: createEgovPayAdapter(env),
    egovChain: createEgovChainAdapter(env),
    eReport: createEReportAdapter(env),
    dbmCompass: createDbmCompassAdapter(env),
  };
}

export {
  createDbmCompassAdapter,
  createEgovAiAdapter,
  createEgovChainAdapter,
  createEgovPayAdapter,
  createEgovSsoAdapter,
  createEMessageAdapter,
  createEReportAdapter,
  createEVerifyAdapter,
  createFaceLivenessAdapter,
};
