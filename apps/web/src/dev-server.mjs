import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const templateUrl = new URL("../public/index.html", import.meta.url);
const template = await readFile(templateUrl, "utf8");
const clientId = (
  process.env.EGOV_SSO_CLIENT_ID ??
  process.env.EGOV_SSO_PARTNER_CODE ??
  ""
).trim();
const apiBase = (process.env.EGOV_API_BASE_URL ?? "http://localhost:8787").trim();

function escapeHtmlAttribute(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const html = template.replaceAll(
  "__EGOV_SSO_CLIENT_ID__",
  escapeHtmlAttribute(clientId),
);
const configuredHtml = html.replaceAll("__EGOV_API_BASE_URL__", escapeHtmlAttribute(apiBase));

const port = Number(process.env.EGOV_WEB_PORT ?? 5173);
const host = process.env.EGOV_WEB_HOST?.trim() || "127.0.0.1";

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${host}:${port}`);
  if (req.method !== "GET" || url.pathname !== "/") {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  if (!clientId) {
    res.writeHead(503, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end("Set EGOV_SSO_CLIENT_ID or EGOV_SSO_PARTNER_CODE in the local .env file.");
    return;
  }

  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(configuredHtml);
}).listen(port, host, () => {
  console.log(`eGov web SSO test app on http://${host}:${port}`);
});
