import {
  createAuthHttpHandlers,
  createBangonHttpHandlers,
  createCaseHttpHandlers,
  createFaceLivenessHttpHandlers,
  healthResponse,
} from "@egov/adapters-http";
import { createEgovPlatformAdapters } from "@egov/adapters-egov-platform";
import { createInMemoryEventBus } from "@egov/adapters-messaging";
import { createInMemoryPersistence } from "@egov/adapters-persistence";
import type { Clock } from "@egov/application";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

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
  eMessage: platform.emessage,
  eGovPay: platform.egovPay,
  eGovChain: platform.egovChain,
  hash: persistence.hash,
  egovAi: platform.egovAi,
  eReport: platform.eReport,
});

const auth = createAuthHttpHandlers({
  sso: platform.sso,
});

const faceLiveness = createFaceLivenessHttpHandlers({
  faceLiveness: platform.faceLiveness,
});

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,authorization",
} as const;

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...CORS_HEADERS,
  });
  res.end(payload);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";

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

    if (method === "POST" && url.pathname === "/bangon/confirm-identity") {
      const body = (await readJson(req)) as {
        token: string;
        payload: Record<string, unknown>;
        sessionToken?: string;
        sessionId?: string;
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
        const body = (await readJson(req)) as { citizenPhone: string };
        const result = await bangon.notify(matchId, body);
        send(res, result.status, result.body);
        return;
      }
      if (action === "disburse") {
        const body = (await readJson(req)) as {
          amount: number;
          redirectUrl: string;
          callbackUrl: string;
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

    send(res, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
  } catch (cause) {
    send(res, 500, {
      error: {
        code: "INTERNAL",
        message: "Unexpected server error",
        cause: String(cause),
      },
    });
  }
});

const port = Number(process.env.PORT ?? 8787);
server.listen(port, () => {
  console.log(`eGov API listening on http://localhost:${port}`);
});
