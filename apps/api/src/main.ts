import {
  createAuthHttpHandlers,
  createBangonHttpHandlers,
  createCaseHttpHandlers,
  createDbmHttpHandlers,
  createFaceLivenessHttpHandlers,
  healthResponse,
} from "@egov/adapters-http";
import { createEgovPlatformAdapters } from "@egov/adapters-egov-platform";
import { createInMemoryEventBus } from "@egov/adapters-messaging";
import { createInMemoryPersistence } from "@egov/adapters-persistence";
import {
  orchestrateEgovAi,
  type AiToolPolicy,
  type Clock,
  type EgovAiOrchestrationOutcome,
} from "@egov/application";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  publishSignedAgencyProject,
  type AgencySignatureHeaders,
} from "./tolvaris-agency-api.js";

const clock: Clock = { now: () => new Date() };
const persistence = createInMemoryPersistence();
const events = createInMemoryEventBus();
const platform = createEgovPlatformAdapters();

const cases = createCaseHttpHandlers({
  cases: persistence.cases,
  events,
  clock,
  documents: persistence.documents,
});

const bangon = createBangonHttpHandlers({
  eVerify: platform.everify,
  faceLiveness: platform.faceLiveness,
  benefits: persistence.benefits,
  dbmCompass: platform.dbmCompass,
  clock,
  matches: persistence.matches,
  notifications: persistence.notifications,
  eMessage: platform.emessage,
  eGovPay: platform.egovPay,
  eGovChain: platform.egovChain,
  hash: persistence.hash,
  egovAi: platform.egovAi,
  eReport: platform.eReport,
  ...(process.env.EGOVPAY_REDIRECT_URL
    ? { defaultRedirectUrl: process.env.EGOVPAY_REDIRECT_URL }
    : {}),
  ...(process.env.EGOVPAY_CALLBACK_URL
    ? { defaultCallbackUrl: process.env.EGOVPAY_CALLBACK_URL }
    : {}),
  ...(process.env.EGOVCHAIN_ANCHOR_METHOD
    ? { chainAnchorMethod: process.env.EGOVCHAIN_ANCHOR_METHOD }
    : {}),
});

const auth = createAuthHttpHandlers({
  sso: platform.sso,
});

const faceLiveness = createFaceLivenessHttpHandlers({
  faceLiveness: platform.faceLiveness,
});

const dbm = createDbmHttpHandlers({
  dbmCompass: platform.dbmCompass,
});

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization,x-request-id,x-agency-key-id,x-agency-timestamp,x-agency-nonce,x-agency-signature",
} as const;

async function readBody(req: IncomingMessage): Promise<{ raw: string; json: unknown }> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = chunks.length === 0 ? "{}" : Buffer.concat(chunks).toString("utf8");
  return { raw, json: JSON.parse(raw) as unknown };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  return (await readBody(req)).json;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body ?? {});
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...CORS_HEADERS,
  });
  res.end(payload);
}

function isEgovAiFailure(
  outcome: EgovAiOrchestrationOutcome,
): outcome is Extract<EgovAiOrchestrationOutcome, { readonly ok: false }> {
  return outcome.ok === false;
}

export const handleRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";
  const requestIdHeader = req.headers["x-request-id"];
  const requestId = typeof requestIdHeader === "string" && requestIdHeader.trim()
    ? requestIdHeader.trim().slice(0, 128)
    : randomUUID();
  const requestStarted = performance.now();
  res.setHeader("x-request-id", requestId);
  res.once("finish", () => {
    const status = res.statusCode;
    const entry = {
      level: status >= 500 ? "error" : status >= 400 ? "warn" : "info",
      event: "http_request",
      requestId,
      method,
      path: url.pathname,
      status,
      durationMs: Number((performance.now() - requestStarted).toFixed(2)),
    };
    const line = JSON.stringify(entry);
    if (status >= 500) console.error(line);
    else if (status >= 400) console.warn(line);
    else console.log(line);
  });

  try {
    if (method === "OPTIONS") {
      res.writeHead(204, { ...CORS_HEADERS });
      res.end();
      return;
    }

    if (method === "GET" && url.pathname === "/health") {
      const health = healthResponse();
      send(res, health.status, health.body);
      return;
    }

    if (method === "GET" && url.pathname === "/client/config") {
      send(res, 200, {
        sso: {
          environment: process.env.EGOV_SSO_ENV?.trim().toUpperCase() || "STAGING",
          clientId:
            process.env.EGOV_SSO_CLIENT_ID?.trim() ||
            process.env.EGOV_SSO_PARTNER_CODE?.trim() ||
            "",
        },
        eVerify: {
          publicKey: process.env.EVERIFY_PUBLIC_KEY?.trim() || "",
        },
      });
      return;
    }

    if (method === "POST" && url.pathname === "/ai/orchestrate") {
      const body = (await readJson(req)) as {
        prompt: string;
        category?: string;
        sourceLang?: string;
        targetLang?: string;
        translator?: AiToolPolicy;
        speech?: AiToolPolicy;
        laws?: AiToolPolicy;
      };
      const result = await orchestrateEgovAi(
        {
          egovAi: platform.egovAi,
          log(entry) {
            const line = JSON.stringify({
              level: entry.status === "failed" ? "error" : "info",
              ...entry,
            });
            if (entry.status === "failed") console.error(line);
            else console.log(line);
          },
        },
        { ...body, correlationId: requestId },
      );
      const outcome: EgovAiOrchestrationOutcome = result;
      if (isEgovAiFailure(outcome)) {
        const status = outcome.error.code === "VALIDATION" ? 400 : 503;
        send(res, status, {
          error: { code: outcome.error.code, message: outcome.error.message },
          metrics: outcome.metrics,
        });
      } else {
        send(res, 200, outcome.value);
      }
      return;
    }

    if (method === "POST" && url.pathname === "/tolvaris/projects") {
      const body = await readBody(req);
      const header = (name: string): string => {
        const value = req.headers[name];
        return typeof value === "string" ? value.trim() : "";
      };
      const headers: AgencySignatureHeaders = {
        keyId: header("x-agency-key-id"),
        timestamp: header("x-agency-timestamp"),
        nonce: header("x-agency-nonce"),
        signature: header("x-agency-signature"),
      };
      const result = await publishSignedAgencyProject({
        rawBody: body.raw,
        parsedBody: body.json,
        headers,
        correlationId: requestId,
      });
      send(res, result.status, result.body);
      return;
    }

    // ─── Auth (citizen SSO) ─────────────────────────────────────────────
    if (method === "POST" && url.pathname === "/auth/sso/exchange") {
      const body = (await readJson(req)) as {
        exchangeCode: string;
        scope?: string;
      };
      const result = await auth.exchangeSso(body);
      send(res, result.status, result.body);
      return;
    }

    if (method === "POST" && url.pathname === "/auth/sso/profile") {
      const body = (await readJson(req)) as { accessToken: string };
      const result = await auth.ssoProfile(body);
      send(res, result.status, result.body);
      return;
    }

    if (method === "POST" && url.pathname === "/auth/sso/complete") {
      const body = (await readJson(req)) as {
        exchangeCode: string;
        scope?: string;
      };
      const result = await auth.completeSso(body);
      send(res, result.status, result.body);
      return;
    }

    if (method === "POST" && url.pathname === "/cases") {
      const body = (await readJson(req)) as { citizenId: string; title: string };
      const result = await cases.submit(body);
      send(res, result.status, result.body);
      return;
    }

    const caseMatch = url.pathname.match(/^\/cases\/([^/]+)$/);
    if (method === "GET" && caseMatch?.[1]) {
      const result = await cases.get(caseMatch[1]);
      send(res, result.status, result.body);
      return;
    }

    const advanceMatch = url.pathname.match(/^\/cases\/([^/]+)\/advance$/);
    if (method === "POST" && advanceMatch?.[1]) {
      const body = (await readJson(req)) as { nextStatus: never };
      const result = await cases.advance(advanceMatch[1], body);
      send(res, result.status, result.body);
      return;
    }

    const documentsMatch = url.pathname.match(/^\/cases\/([^/]+)\/documents$/);
    if (method === "POST" && documentsMatch?.[1]) {
      const body = (await readJson(req)) as {
        fileName: string;
        contentType: string;
        contentBase64: string;
      };
      const result = await cases.attachDocument(documentsMatch[1], body);
      send(res, result.status, result.body);
      return;
    }

    // ─── BANGON ───────────────────────────────────────────────────────────
    if (method === "POST" && url.pathname === "/bangon/liveness/session") {
      const body = (await readJson(req)) as {
        action: "redirect" | "post" | "close";
        callbackUrl?: string;
        delay?: number;
      };
      const result = await faceLiveness.createSession(body);
      send(res, result.status, result.body);
      return;
    }

    const livenessResult = url.pathname.match(
      /^\/bangon\/liveness\/result\/([^/]+)$/,
    );
    if (method === "GET" && livenessResult?.[1]) {
      const result = await faceLiveness.getResult(
        decodeURIComponent(livenessResult[1]),
      );
      send(res, result.status, result.body);
      return;
    }

    if (method === "GET" && url.pathname === "/bangon/everify/config") {
      const publicKey = process.env.EVERIFY_PUBLIC_KEY?.trim() ?? "";
      if (!publicKey) {
        send(res, 503, {
          error: {
            code: "UNAVAILABLE",
            message: "EVERIFY_PUBLIC_KEY is not configured",
          },
        });
        return;
      }
      send(res, 200, { publicKey });
      return;
    }

    if (method === "POST" && url.pathname === "/bangon/confirm-identity") {
      const body = (await readJson(req)) as {
        sessionToken?: string;
        sessionId?: string;
        faceLivenessSessionId: string;
        firstName: string;
        lastName: string;
        birthDate: string;
        middleName?: string;
        suffix?: string;
        citizenId?: string;
        uniqid?: string;
      };
      const result = await bangon.confirmIdentity(body);
      send(res, result.status, result.body);
      return;
    }

    if (method === "POST" && url.pathname === "/bangon/matches") {
      const body = (await readJson(req)) as {
        citizenId: string;
        profile: {
          dateOfBirth: string;
          civilStatus: string;
          vitalStatus: string;
        };
      };
      const result = await bangon.findMatches(body);
      send(res, result.status, result.body);
      return;
    }

    const bangonAction = url.pathname.match(
      /^\/bangon\/matches\/([^/]+)\/(notify|disburse|anchor|explain)$/,
    );
    if (method === "POST" && bangonAction?.[1] && bangonAction[2]) {
      const matchId = bangonAction[1];
      const action = bangonAction[2];
      if (action === "notify") {
        const body = (await readJson(req)) as {
          citizenPhone: string;
          category?: "BENEFIT_ANNOUNCEMENT" | "QUALIFICATION_RESULT" | "REQUIREMENTS_NEEDED" | "APPLICATION_STATUS" | "ACTION_REMINDER";
          contextKey?: string;
          requirements?: readonly string[];
          statusText?: string;
          actionText?: string;
          deadlineText?: string;
        };
        const result = await bangon.notify(matchId, body);
        send(res, result.status, result.body);
        return;
      }
      if (action === "disburse") {
        const body = (await readJson(req)) as {
          amount: number;
          redirectUrl?: string;
          callbackUrl?: string;
          txnid?: string;
          currency?: string;
        };
        const result = await bangon.disburse(matchId, body);
        send(res, result.status, result.body);
        return;
      }
      if (action === "anchor") {
        const result = await bangon.anchor(matchId);
        send(res, result.status, result.body);
        return;
      }
      if (action === "explain") {
        const result = await bangon.explain(matchId);
        send(res, result.status, result.body);
        return;
      }
    }

    if (method === "POST" && url.pathname === "/bangon/report-non-delivery") {
      const body = (await readJson(req)) as {
        accessToken: string;
        citizenId: string;
        benefitId: string;
        benefitTitle: string;
        mobile: string;
        firstName: string;
        lastName: string;
        gender: string;
        email: string;
        description: string;
        regionCode: string;
        provinceCode: string;
        municipalityCode: string;
        barangayCode: string;
      };
      const result = await bangon.reportNonDelivery(body);
      send(res, result.status, result.body);
      return;
    }

    // ─── DBM Compass Transparency ───────────────────────────────────────
    if (method === "GET" && url.pathname === "/bangon/transparency/projects") {
      const programCode = url.searchParams.get("programCode");
      const reportYearRaw = url.searchParams.get("reportYear");
      const region = url.searchParams.get("region");
      const province = url.searchParams.get("province");
      const municipality = url.searchParams.get("municipality");
      const pageRaw = url.searchParams.get("page");
      const limitRaw = url.searchParams.get("limit");
      const query: {
        programCode?: string;
        reportYear?: number;
        region?: string;
        province?: string;
        municipality?: string;
        page?: number;
        limit?: number;
      } = {};
      if (programCode) query.programCode = programCode;
      if (reportYearRaw) query.reportYear = Number(reportYearRaw);
      if (region) query.region = region;
      if (province) query.province = province;
      if (municipality) query.municipality = municipality;
      if (pageRaw) query.page = Number(pageRaw);
      if (limitRaw) query.limit = Number(limitRaw);
      const result = await dbm.listTransparencyProjects(query);
      send(res, result.status, result.body);
      return;
    }

    send(res, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
  } catch (cause) {
    console.error(JSON.stringify({
      level: "error",
      event: "http_unhandled_error",
      requestId,
      method,
      path: url.pathname,
      errorType: cause instanceof Error ? cause.name : "UnknownError",
    }));
    send(res, 500, {
      error: {
        code: "INTERNAL",
        message: "Unexpected server error",
      },
    });
  }
};

if (process.env.VERCEL === undefined) {
  const server = createServer(handleRequest);
  const port = Number(process.env.PORT ?? 8787);
  server.listen(port, () => {
    console.log(`eGov API listening on http://localhost:${port}`);
  });
}
