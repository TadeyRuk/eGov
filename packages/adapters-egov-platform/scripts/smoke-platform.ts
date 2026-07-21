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
    scope: envGet("SMOKE_SSO_SCOPE") ?? "SSO_AUTHENTICATION",
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
  // Optional: EVERIFY_PUBLIC_KEY is for Face Liveness Web SDK pubKey (client), not auth smoke.
  const res = await p.everify.authenticate();
  if (!res.ok) {
    fail("everify", errMsg(res.error));
    return;
  }
  // Official auth nests access_token under data; adapter unwraps into res.value.token
  pass("everify", res.value.token ? "authenticate ok (token issued)" : "authenticate ok (empty token — check data.access_token shape)");
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
  const res = await p.faceLiveness.createSession({
    action: "close",
    delay: envGet("SMOKE_LIVENESS_DELAY")
      ? Number(envGet("SMOKE_LIVENESS_DELAY"))
      : undefined,
  });
  if (!res.ok) {
    fail("face-liveness", errMsg(res.error));
    return;
  }
  pass(
    "face-liveness",
    `createSession ok (token length=${res.value.token.length}, url returned=${res.value.url.length > 0})`,
  );
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
    number: to,
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
  // Official: POST /api/v1/egov/integration/token with { access_code }
  const res = await p.egovAi.token();
  if (!res.ok) {
    fail("egov-ai", errMsg(res.error));
    return;
  }
  pass(
    "egov-ai",
    `token ok (credits_remaining=${res.value.creditsRemaining ?? "?"})`,
  );
}

async function smokePay(p: EgovPlatformAdapters): Promise<void> {
  if (!hasAny("EGOVPAY_API_KEY", "EGOVPAY_TOKEN")) {
    fail("egov-pay", "missing EGOVPAY_API_KEY / EGOVPAY_TOKEN");
    return;
  }
  if (write) {
    if (!envGet("EGOVPAY_SETTLEMENT_TEMPLATE_UUID")) {
      fail("egov-pay", "write mode needs EGOVPAY_SETTLEMENT_TEMPLATE_UUID");
      return;
    }
    const amount = Number(envGet("SMOKE_PAY_AMOUNT") ?? "1");
    const txnid = envGet("SMOKE_PAY_TXNID") ?? `smoke-${Date.now()}`;
    const redirectUrl =
      envGet("SMOKE_PAY_REDIRECT_URL") ??
      envGet("EGOVPAY_REDIRECT_URL") ??
      "https://example.com/pay/return";
    const callbackUrl =
      envGet("SMOKE_PAY_CALLBACK_URL") ??
      envGet("EGOVPAY_CALLBACK_URL") ??
      "https://example.com/pay/callback";
    const res = await p.egovPay.generatePayment({
      payload: {
        items: [{ name: "Smoke test", amount }],
        amount,
        txnid,
        redirect_url: redirectUrl,
        callback_url: callbackUrl,
        currency: envGet("SMOKE_PAY_CURRENCY") ?? "PHP",
      },
    });
    if (!res.ok) {
      fail("egov-pay", `generate: ${errMsg(res.error)}`);
      return;
    }
    pass("egov-pay", "generatePayment ok");
    return;
  }
  // Safe probe: token-authenticated GET (expect not-found — proves auth header)
  const probeId = envGet("SMOKE_PAY_TRANSACTION_ID") ?? "smoke-probe-id";
  const res = await p.egovPay.getTransaction(probeId);
  if (res.ok) {
    pass("egov-pay", "getTransaction ok");
    return;
  }
  // Platform rejecting unknown id still means credentials + path ran
  if (res.error.code === "VALIDATION" || res.error.code === "NOT_FOUND") {
    pass(
      "egov-pay",
      `token get reached platform (${res.error.code}; expected for probe id)`,
    );
    return;
  }
  if (res.error.code === "UNAVAILABLE" && /HTTP 4\d\d/.test(res.error.message)) {
    pass("egov-pay", `token get reached platform (${res.error.message})`);
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
  const accessCode = envGet("EREPORT_ACCESS_TOKEN") ?? envGet("EREPORT_API_KEY");
  if (!accessCode) {
    fail("ereport", "missing EREPORT_ACCESS_TOKEN / EREPORT_API_KEY");
    return;
  }
  // Real flow (dashboard, 2026-07-22): POST /api/integration/token with
  // { access_code } -> access_token, then Bearer that token for datasets.
  const tokenRes = await p.eReport.generateToken(accessCode);
  if (!tokenRes.ok) {
    fail("ereport", `generateToken: ${errMsg(tokenRes.error)}`);
    return;
  }
  const types = await p.eReport.getReportTypes(tokenRes.value.accessToken);
  if (!types.ok) {
    fail("ereport", `getReportTypes: ${errMsg(types.error)}`);
    return;
  }
  pass(
    "ereport",
    `token + getReportTypes ok (report_types=${types.value.length})`,
  );
}

async function smokeDbm(p: EgovPlatformAdapters): Promise<void> {
  if (!hasAny("DBM_COMPASS_API_KEY")) {
    fail("dbm-compass", "missing DBM_COMPASS_API_KEY");
    return;
  }
  const year = Number(envGet("SMOKE_DBM_REPORT_YEAR") ?? "2026");
  const res = await p.dbmCompass.getSaaodbRecords({
    reportYear: year,
    period: "FY",
    page: 1,
    limit: 10,
  });
  if (!res.ok) {
    fail("dbm-compass", errMsg(res.error));
    return;
  }
  pass("dbm-compass", `GET /api/v1/records/saaodb ok (year=${year})`);
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
