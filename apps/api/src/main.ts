import { createCaseHttpHandlers, healthResponse } from "@egov/adapters-http";
import { createInMemoryEventBus } from "@egov/adapters-messaging";
import { createInMemoryPersistence } from "@egov/adapters-persistence";
import type { Clock } from "@egov/application";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

const clock: Clock = { now: () => new Date() };
const persistence = createInMemoryPersistence();
const events = createInMemoryEventBus();

const cases = createCaseHttpHandlers({
  cases: persistence.cases,
  events,
  clock,
});

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
  });
  res.end(payload);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const method = req.method ?? "GET";

  try {
    if (method === "GET" && url.pathname === "/health") {
      const health = healthResponse();
      send(res, health.status, health.body);
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

    send(res, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
  } catch (cause) {
    send(res, 500, {
      error: { code: "INTERNAL", message: "Unexpected server error", cause: String(cause) },
    });
  }
});

const port = Number(process.env.PORT ?? 8787);
server.listen(port, () => {
  console.log(`eGov API listening on http://localhost:${port}`);
});
