/**
 * Placeholder UI shell. Phase 4 replaces this with Vite + React.
 * Keeps the app slot in the monorepo so boundaries stay clear from day one.
 */
import { createServer } from "node:http";

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>eGov</title>
    <style>
      :root { color-scheme: light; font-family: "IBM Plex Sans", "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center;
        background: linear-gradient(160deg, #e8f1f5 0%, #f7faf8 45%, #eef2e8 100%); color: #143042; }
      main { text-align: center; max-width: 36rem; padding: 2rem; }
      h1 { font-family: "IBM Plex Serif", Georgia, serif; font-weight: 600; letter-spacing: -0.02em; font-size: 3rem; margin: 0 0 0.5rem; }
      p { margin: 0; line-height: 1.5; opacity: 0.85; }
    </style>
  </head>
  <body>
    <main>
      <h1>eGov</h1>
      <p>Web shell placeholder. API and orchestrator packages own runtime behavior until Phase 4.</p>
    </main>
  </body>
</html>`;

const port = Number(process.env.PORT ?? 5173);
createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(port, () => {
  console.log(`eGov web shell on http://localhost:${port}`);
});
