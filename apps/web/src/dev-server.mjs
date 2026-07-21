/**
 * Placeholder UI shell. Phase 4 replaces this with Vite + React.
 * Keeps the app slot in the monorepo so boundaries stay clear from day one.
 */
import { createServer } from "node:http";

const clientId = process.env.EGOV_SSO_PARTNER_CODE ?? "";
const apiBase = process.env.EGOV_API_BASE_URL ?? "http://localhost:8787";

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="egov-environment" content="STAGING" />
    <meta name="egov-client-id" content="${clientId}" />
    <meta name="egov-sso-onsuccess" content="onEgovSsoSuccess" />
    <title>eGovPH Sign In</title>
    <style>
      :root { color-scheme: light; font-family: "IBM Plex Sans", "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center;
        background: linear-gradient(160deg, #e8f1f5 0%, #f7faf8 45%, #eef2e8 100%); color: #143042; }
      main { width: min(38rem, calc(100% - 2rem)); padding: 3rem 0; }
      section { background: rgba(255,255,255,.92); border: 1px solid #d6e1e5; border-radius: 1.25rem;
        box-shadow: 0 1.25rem 4rem rgba(18,48,66,.12); padding: clamp(1.5rem, 6vw, 3rem); }
      .eyebrow { color: #245f77; font-size: .8rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
      h1 { font-family: "IBM Plex Serif", Georgia, serif; font-weight: 600; letter-spacing: -0.02em;
        font-size: clamp(2.2rem, 7vw, 3.4rem); margin: .45rem 0 .8rem; }
      p { margin: 0; line-height: 1.6; opacity: 0.82; }
      a.button { display: block; margin-top: 1.75rem; padding: .95rem 1.2rem; border-radius: .75rem;
        background: #075985; color: white; text-align: center; text-decoration: none; font-weight: 700; }
      a.button:hover { background: #064d71; }
      .note { margin-top: 1.25rem; padding-top: 1.25rem; border-top: 1px solid #dce5e8; font-size: .92rem; }
      code { color: #164e63; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <div class="eyebrow">Official account connection</div>
        <h1>Sign in with eGovPH</h1>
        <p>Use the official eGovPH sign-in widget. This website never sees your OTP or MPIN.</p>
        <div id="egov-sso-widget-button"></div><div id="egov-sso-widget-portal"></div>
        <pre id="result" class="note" hidden></pre>
      </section>
    </main>
    <script>
      async function onEgovSsoSuccess(exchangeCode) {
        const result = document.querySelector('#result'); result.hidden = false; result.textContent = 'Verifying eGovPH sign-in…';
        const response = await fetch('${apiBase}/auth/egov/exchange', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ exchangeCode }) });
        const body = await response.json().catch(() => ({}));
        result.textContent = response.ok ? JSON.stringify(body.profile, null, 2) : 'Sign-in could not be completed.';
      }
    </script>
    <script async defer src="https://widgets.e.gov.ph/egov-hackathon-sso-widget.js"></script>
  </body>
</html>`;

const port = Number(process.env.PORT ?? 5173);
createServer((_req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(port, () => {
  console.log(`eGov web shell on http://localhost:${port}`);
});
