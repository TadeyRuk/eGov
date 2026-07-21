/**
 * Optional local/debug shell — NOT the BANGON product UI.
 * Primary citizen client is Android (see docs/tasks.md Phase 4).
 */
import { createServer } from "node:http";

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>eGov — debug shell</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 2rem; max-width: 40rem; }
      code { background: #f4f4f5; padding: 0.1rem 0.35rem; border-radius: 4px; }
    </style>
  </head>
  <body>
    <h1>eGov debug shell</h1>
    <p>
      This is <strong>not</strong> the citizen product. BANGON’s primary UI is the
      <strong>Android</strong> app, which talks to <code>apps/api</code> only.
    </p>
    <p>API and orchestrator packages own runtime behavior. See <code>docs/tasks.md</code> Phase 4.</p>
  </body>
</html>`;

const port = Number(process.env.PORT ?? 5173);
createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(port, () => {
  console.log(`eGov debug web shell on http://localhost:${port}`);
});
