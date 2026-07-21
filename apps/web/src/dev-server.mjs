import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import configHandler from "../api/config.js";
import exchangeHandler from "../api/auth/egov/exchange.js";
import cardsHandler from "../api/cards.js";

const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
const port = Number(process.env.EGOV_WEB_PORT ?? 5173);
const host = process.env.EGOV_WEB_HOST?.trim() || "127.0.0.1";

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function vercelResponse(response) {
  return {
    setHeader(name, value) { response.setHeader(name, value); },
    status(code) {
      response.statusCode = code;
      return this;
    },
    json(body) {
      const payload = JSON.stringify(body);
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.setHeader("content-length", Buffer.byteLength(payload));
      response.end(payload);
    },
  };
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  try {
    if (request.method === "GET" && url.pathname === "/") {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(html);
      return;
    }
    if (url.pathname === "/api/config") {
      await configHandler(request, vercelResponse(response));
      return;
    }
    if (url.pathname === "/api/auth/egov/exchange") {
      request.body = await readJson(request);
      await exchangeHandler(request, vercelResponse(response));
      return;
    }
    if (url.pathname === "/api/cards") {
      request.query = Object.fromEntries(url.searchParams);
      await cardsHandler(request, vercelResponse(response));
      return;
    }
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  } catch {
    response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Unexpected server error" }));
  }
}).listen(port, host, () => {
  console.log(`eGov web SSO app on http://${host}:${port}`);
});
