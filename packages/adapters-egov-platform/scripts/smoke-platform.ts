/**
 * Platform adapter smoke — credential presence + safe live probes.
 *
 * Usage (from repo root):
 *   pnpm smoke:platform
 *   pnpm smoke:platform -- --write          # Face session; SMS; eGov AI generate; Pay generate
 *   pnpm smoke:platform -- --only=everify,egov-chain
 *   pnpm smoke:platform -- --only=egov-ai --write   # token + one ai_assistant generate (spends credits)
 *
 * Never prints secret values. Side-effecting calls stay behind --write.
 */
import {
  createEgovPlatformAdapters,
  processEnv,
  type EgovPlatformAdapters,
} from "../src/index.js";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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
  durationMs: number;
};

const rows: Row[] = [];

function envGet(key: string): string | undefined {
  return process.env[key]?.trim() || undefined;
}

function hasAny(...keys: string[]): boolean {
  return keys.some((k) => Boolean(envGet(k)));
}

function skip(name: SmokeName, detail: string): void {
  rows.push({ name, status: "skip", detail, durationMs: 0 });
}

function pass(name: SmokeName, detail: string): void {
  rows.push({ name, status: "pass", detail, durationMs: 0 });
}

function fail(name: SmokeName, detail: string): void {
  rows.push({ name, status: "fail", detail, durationMs: 0 });
}

function errMsg(error: { message?: string; code?: string; cause?: unknown }): string {
  return `${error.code ?? "ERR"}: ${error.message ?? "unknown"}`;
}

async function smokeSso(p: EgovPlatformAdapters): Promise<void> {
  if (!hasAny("EGOV_SSO_PARTNER_CODE") || !hasAny("EGOV_SSO_PARTNER_SECRET")) {
    fail("sso", "missing EGOV_SSO_PARTNER_CODE / EGOV_SSO_PARTNER_SECRET");
    return;
  }

  // Prefer a fresh exchange code; optional reuse of a still-valid access token for profile.
  const code = envGet("SMOKE_SSO_EXCHANGE_CODE");
  const existingToken = envGet("SMOKE_SSO_ACCESS_TOKEN");

  let accessToken: string | undefined = existingToken?.trim() || undefined;

  if (code) {
    const res = await p.sso.exchangeToken({
      exchangeCode: code,
      scope: envGet("SMOKE_SSO_SCOPE") ?? "SSO_AUTHENTICATION",
    });
    if (!res.ok) {
      fail("sso", `exchangeToken: ${errMsg(res.error)}`);
      return;
    }
    accessToken = res.value.accessToken;
    pass(
      "sso",
      `exchangeToken ok (expires_in=${res.value.expiresIn ?? "?"})`,
    );
  } else if (!accessToken) {
    skip(
      "sso",
      "creds present; set SMOKE_SSO_EXCHANGE_CODE (or SMOKE_SSO_ACCESS_TOKEN for profile-only)",
    );
    return;
  } else {
    pass("sso", "using SMOKE_SSO_ACCESS_TOKEN (skipped exchange)");
  }

  // Profile must run immediately — access tokens are short-TTL.
  const profile = await p.sso.authenticatePartner(accessToken);
  if (!profile.ok) {
    fail("sso", `authenticatePartner: ${errMsg(profile.error)}`);
    return;
  }
  const raw = profile.value.raw as Record<string, unknown>;
  const uniqid = String(
    raw.uniqid ??
      (raw.data as Record<string, unknown> | undefined)?.uniqid ??
      "",
  );
  pass(
    "sso",
    `authenticatePartner ok${uniqid ? ` (uniqid present)` : " (profile JSON returned)"}`,
  );
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

  // Generation spends platform credits — only behind --write.
  if (!write) {
    skip(
      "egov-ai",
      "pass --write to call ai_assistant/generate (spends credits)",
    );
    return;
  }

  const prompt =
    envGet("SMOKE_AI_PROMPT") ??
    "Explain in one short sentence why a senior citizen may qualify for a government pension benefit. Plain language.";
  const category = envGet("SMOKE_AI_CATEGORY") ?? "PH";
  const gen = await p.egovAi.aiAssistant({
    prompt,
    category,
    token: res.value.accessToken,
  });
  if (!gen.ok) {
    fail("egov-ai", `generate: ${errMsg(gen.error)}`);
    return;
  }
  const text = gen.value.data.trim();
  if (!text) {
    fail("egov-ai", "generate returned empty data");
    return;
  }
  pass(
    "egov-ai",
    `ai_assistant generate ok (chars=${text.length}, session_id=${gen.value.sessionId || "?"})`,
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
  const token = tokenRes.value.accessToken;
  const types = await p.eReport.getReportTypes(token);
  if (!types.ok) {
    fail("ereport", `getReportTypes: ${errMsg(types.error)}`);
    return;
  }
  pass(
    "ereport",
    `token + getReportTypes ok (report_types=${types.value.length})`,
  );

  // Deeper read-only dataset probes (no complaint filed).
  const regions = await p.eReport.getRegions(token);
  if (!regions.ok) {
    fail("ereport", `getRegions: ${errMsg(regions.error)}`);
    return;
  }
  pass("ereport", `getRegions ok (regions=${regions.value.length})`);

  // submitComplaint / OTP create real cases + need a real inbox — opt-in only.
  if (!write || envGet("SMOKE_EREPORT_SUBMIT") !== "1") {
    skip(
      "ereport",
      "submit/OTP OOS by default; pass --write and SMOKE_EREPORT_SUBMIT=1 to file a real complaint",
    );
    return;
  }

  const mobile = envGet("SMOKE_EREPORT_MOBILE");
  const email = envGet("SMOKE_EREPORT_EMAIL");
  const regionCode = envGet("SMOKE_EREPORT_REGION_CODE");
  const provinceCode = envGet("SMOKE_EREPORT_PROVINCE_CODE");
  const municipalityCode = envGet("SMOKE_EREPORT_MUNICIPALITY_CODE");
  const barangayCode = envGet("SMOKE_EREPORT_BARANGAY_CODE");
  if (
    !mobile ||
    !email ||
    !regionCode ||
    !provinceCode ||
    !municipalityCode ||
    !barangayCode
  ) {
    fail(
      "ereport",
      "SMOKE_EREPORT_SUBMIT=1 needs SMOKE_EREPORT_MOBILE, EMAIL, REGION/PROVINCE/MUNICIPALITY/BARANGAY_CODE",
    );
    return;
  }

  const submitted = await p.eReport.submitComplaint({
    accessToken: token,
    mobile,
    firstName: envGet("SMOKE_EREPORT_FIRST_NAME") ?? "Smoke",
    lastName: envGet("SMOKE_EREPORT_LAST_NAME") ?? "Test",
    gender: envGet("SMOKE_EREPORT_GENDER") ?? "male",
    complainantEmail: email,
    reportType: envGet("SMOKE_EREPORT_REPORT_TYPE") ?? "red_tape",
    subject: envGet("SMOKE_EREPORT_SUBJECT") ?? "BANGON smoke non-delivery",
    message:
      envGet("SMOKE_EREPORT_MESSAGE") ??
      "Automated smoke — please ignore / close.",
    regionCode,
    provinceCode,
    municipalityCode,
    barangayCode,
  });
  if (!submitted.ok) {
    fail("ereport", `submitComplaint: ${errMsg(submitted.error)}`);
    return;
  }
  pass(
    "ereport",
    `submitComplaint ok (case_number=${submitted.value.caseNumber || "?"})`,
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
    const rowIndex = rows.length;
    const startedAt = performance.now();
    try {
      await runners[name](platform);
    } catch (cause) {
      fail(name, cause instanceof Error ? cause.message : String(cause));
    }
    const row = rows[rowIndex];
    if (row) {
      rows[rowIndex] = {
        ...row,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
      };
    }
  }

  const width = Math.max(...rows.map((r) => r.name.length), 8);
  for (const r of rows) {
    const tag =
      r.status === "pass" ? "PASS" : r.status === "skip" ? "SKIP" : "FAIL";
    console.log(`${tag.padEnd(4)} ${r.name.padEnd(width)}  ${String(r.durationMs).padStart(8)} ms  ${r.detail}`);
  }

  const failed = rows.filter((r) => r.status === "fail").length;
  const passed = rows.filter((r) => r.status === "pass").length;
  const skipped = rows.filter((r) => r.status === "skip").length;
  console.log(`summary: ${passed} pass, ${skipped} skip, ${failed} fail`);
  const generatedAt = new Date().toISOString();
  const reportsDirectory = resolve(process.cwd(), ".local/reports");
  const report = {
    generatedAt,
    kind: "platform-smoke-kpi",
    writeEnabled: write,
    summary: { passed, skipped, failed },
    rows,
  };
  await mkdir(reportsDirectory, { recursive: true });
  await writeFile(
    resolve(reportsDirectory, `platform-smoke-${generatedAt.replace(/[:.]/g, "-")}.json`),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  await writeFile(
    resolve(reportsDirectory, "platform-smoke-latest.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
