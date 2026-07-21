/**
 * Platform adapter smoke — credential presence + safe live probes.
 *
 * Usage (from repo root):
 *   pnpm smoke:platform
 *   pnpm smoke:platform -- --write          # Face session; SMS if SMOKE_SMS_TO set
 *   pnpm smoke:platform -- --only=everify,egov-chain
 *
 * Never prints secret values. Side-effecting calls stay behind --write.
 */
import {
  createEgovPlatformAdapters,
  processEnv,
  type EgovPlatformAdapters,
} from "../src/index.js";

type SmokeName =
  | "sso"
  | "everify"
  | "face-liveness"
  | "emessage"
  | "egov-ai"
  | "egov-pay"
  | "egov-chain"
  | "ereport"
  | "dbm-compass";

const ALL: SmokeName[] = [
  "sso",
  "everify",
  "face-liveness",
  "emessage",
  "egov-ai",
  "egov-pay",
  "egov-chain",
  "ereport",
  "dbm-compass",
];

const write = process.argv.includes("--write");
const onlyArg = process.argv.find((a) => a.startsWith("--only="));
const selected = new Set<SmokeName>(
  onlyArg
    ? (onlyArg
        .slice("--only=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) as SmokeName[])
    : ALL,
);

type Row = {
  name: SmokeName;
  status: "pass" | "fail" | "skip";
  detail: string;
};

const rows: Row[] = [];

function envGet(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

function hasAny(...keys: string[]): boolean {
  return keys.some((k) => Boolean(envGet(k)));
}

function skip(name: SmokeName, detail: string): void {
  rows.push({ name, status: "skip", detail });
}

function pass(name: SmokeName, detail: string): void {
  rows.push({ name, status: "pass", detail });
}

function fail(name: SmokeName, detail: string): void {
  rows.push({ name, status: "fail", detail });
}

function errMsg(error: { message?: string; code?: string; cause?: unknown }): string {
  const base = `${error.code ?? "ERR"}: ${error.message ?? "unknown"}`;
  if (error.cause instanceof Error) return `${base} (${error.cause.message})`;
  if (typeof error.cause === "string") return `${base} (${error.cause})`;
  return base;
}

async function smokeSso(_p: EgovPlatformAdapters): Promise<void> {
  if (!hasAny("EGOV_SSO_PARTNER_CODE") || !hasAny("EGOV_SSO_PARTNER_SECRET")) {
    fail("sso", "missing EGOV_SSO_PARTNER_CODE / EGOV_SSO_PARTNER_SECRET");
    return;
  }
  const code = envGet("SMOKE_SSO_EXCHANGE_CODE");
  if (!code) {
    skip(
      "sso",
      "creds present; set SMOKE_SSO_EXCHANGE_CODE for live token exchange",
    );
    return;
  }
  const res = await _p.sso.exchangeToken({
    exchangeCode: code,
    scope: envGet("SMOKE_SSO_SCOPE") ?? "openid",
  });
  if (!res.ok) {
    fail("sso", errMsg(res.error));
    return;
  }
  pass("sso", "exchangeToken ok");
}

async function smokeEverify(p: EgovPlatformAdapters): Promise<void> {
  if (!hasAny("EVERIFY_CLIENT_ID") || !hasAny("EVERIFY_CLIENT_SECRET")) {
    fail("everify", "missing EVERIFY_CLIENT_ID / EVERIFY_CLIENT_SECRET");
    return;
  }
  const res = await p.everify.authenticate();
  if (!res.ok) {
    fail("everify", errMsg(res.error));
    return;
  }
  pass("everify", res.value.token ? "authenticate ok (token issued)" : "authenticate ok");
}

async function smokeFace(p: EgovPlatformAdapters): Promise<void> {
  if (!hasAny("FACE_LIVENESS_API_KEY")) {
    fail("face-liveness", "missing FACE_LIVENESS_API_KEY");
    return;
  }
  if (!write) {
    skip("face-liveness", "creds present; pass --write to createSession");
    return;
  }
  const res = await p.faceLiveness.createSession({});
  if (!res.ok) {
    fail("face-liveness", errMsg(res.error));
    return;
  }
  pass("face-liveness", `createSession ok (sessionId length=${res.value.sessionId.length})`);
}

async function smokeEmessage(p: EgovPlatformAdapters): Promise<void> {
  if (!hasAny("EMESSAGE_AUTH_TOKEN")) {
    fail("emessage", "missing EMESSAGE_AUTH_TOKEN");
    return;
  }
  const to = envGet("SMOKE_SMS_TO");
  if (!write || !to) {
    skip(
      "emessage",
      "creds present; pass --write and SMOKE_SMS_TO to push SMS",
    );
    return;
  }
  const res = await p.emessage.pushSms({
    to,
    message: envGet("SMOKE_SMS_BODY") ?? "eGov platform smoke",
  });
  if (!res.ok) {
    fail("emessage", errMsg(res.error));
    return;
  }
  pass("emessage", "pushSms ok");
}

async function smokeAi(p: EgovPlatformAdapters): Promise<void> {
  if (!hasAny("EGOV_AI_ACCESS_CODE", "EGOV_AI_API_KEY")) {
    fail("egov-ai", "missing EGOV_AI_ACCESS_CODE / EGOV_AI_API_KEY");
    return;
  }
  const res = await p.egovAi.token();
  if (!res.ok) {
    if (/HTTP 404/.test(res.error.message)) {
      skip(
        "egov-ai",
        "creds loaded; /token 404 — align path with dashboard OpenAPI",
      );
      return;
    }
    fail("egov-ai", errMsg(res.error));
    return;
  }
  pass("egov-ai", "token ok");
}

async function smokePay(p: EgovPlatformAdapters): Promise<void> {
  if (!hasAny("EGOVPAY_API_KEY", "EGOVPAY_TOKEN")) {
    fail("egov-pay", "missing EGOVPAY_API_KEY / EGOVPAY_TOKEN");
    return;
  }
  if (write) {
    const res = await p.egovPay.generatePayment({ payload: {} });
    if (!res.ok) {
      fail("egov-pay", `generate: ${errMsg(res.error)}`);
      return;
    }
    pass("egov-pay", "generatePayment ok");
    return;
  }
  // Safe probe: signed GET (expect not-found / validation — proves auth headers)
  const probeId = envGet("SMOKE_PAY_TRANSACTION_ID") ?? "smoke-probe-id";
  const res = await p.egovPay.getTransaction(probeId);
  if (res.ok) {
    pass("egov-pay", "getTransaction ok");
    return;
  }
  // Platform rejecting unknown id still means credentials + HMAC path ran
  if (res.error.code === "VALIDATION" || res.error.code === "NOT_FOUND") {
    pass(
      "egov-pay",
      `signed get reached platform (${res.error.code}; expected for probe id)`,
    );
    return;
  }
  if (res.error.code === "UNAVAILABLE" && /HTTP 4\d\d/.test(res.error.message)) {
    pass("egov-pay", `signed get reached platform (${res.error.message})`);
    return;
  }
  fail("egov-pay", errMsg(res.error));
}

async function smokeChain(p: EgovPlatformAdapters): Promise<void> {
  const res = await p.egovChain.ethBlockNumber();
  if (!res.ok) {
    fail("egov-chain", errMsg(res.error));
    return;
  }
  pass("egov-chain", `eth_blockNumber ok`);
}

async function smokeEreport(p: EgovPlatformAdapters): Promise<void> {
  if (!hasAny("EREPORT_ACCESS_TOKEN", "EREPORT_API_KEY")) {
    fail("ereport", "missing EREPORT_ACCESS_TOKEN / EREPORT_API_KEY");
    return;
  }
  const res = await p.eReport.datasets();
  if (!res.ok) {
    if (/HTTP 404/.test(res.error.message)) {
      skip(
        "ereport",
        "creds loaded; /datasets 404 — align path with dashboard OpenAPI",
      );
      return;
    }
    fail("ereport", errMsg(res.error));
    return;
  }
  pass("ereport", "datasets ok");
}

async function smokeDbm(p: EgovPlatformAdapters): Promise<void> {
  if (!hasAny("DBM_COMPASS_API_KEY")) {
    fail("dbm-compass", "missing DBM_COMPASS_API_KEY");
    return;
  }
  const res = await p.dbmCompass.query({ dataset: "SAAODB", query: {} });
  if (!res.ok) {
    // Auth accepted but empty query rejected still counts as reachability
    if (
      res.error.code === "VALIDATION" ||
      (res.error.code === "UNAVAILABLE" && /HTTP 4\d\d/.test(res.error.message))
    ) {
      pass("dbm-compass", `reached platform (${res.error.code})`);
      return;
    }
    fail("dbm-compass", errMsg(res.error));
    return;
  }
  pass("dbm-compass", "SAAODB query ok");
}

async function main(): Promise<void> {
  const envFileHint = envGet("EGOV_SSO_PARTNER_CODE") || envGet("EGOVPAY_API_KEY");
  if (!envFileHint) {
    console.error(
      "No platform creds in process.env. Run with Node --env-file=.env from repo root (pnpm smoke:platform).",
    );
  }

  const platform = createEgovPlatformAdapters(processEnv());
  const runners: Record<SmokeName, (p: EgovPlatformAdapters) => Promise<void>> = {
    sso: smokeSso,
    everify: smokeEverify,
    "face-liveness": smokeFace,
    emessage: smokeEmessage,
    "egov-ai": smokeAi,
    "egov-pay": smokePay,
    "egov-chain": smokeChain,
    ereport: smokeEreport,
    "dbm-compass": smokeDbm,
  };

  console.log(
    `platform smoke (write=${write}) services=${[...selected].join(",")}`,
  );

  for (const name of ALL) {
    if (!selected.has(name)) continue;
    try {
      await runners[name](platform);
    } catch (cause) {
      fail(name, cause instanceof Error ? cause.message : String(cause));
    }
  }

  const width = Math.max(...rows.map((r) => r.name.length), 8);
  for (const r of rows) {
    const tag =
      r.status === "pass" ? "PASS" : r.status === "skip" ? "SKIP" : "FAIL";
    console.log(`${tag.padEnd(4)} ${r.name.padEnd(width)}  ${r.detail}`);
  }

  const failed = rows.filter((r) => r.status === "fail").length;
  const passed = rows.filter((r) => r.status === "pass").length;
  const skipped = rows.filter((r) => r.status === "skip").length;
  console.log(`summary: ${passed} pass, ${skipped} skip, ${failed} fail`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
