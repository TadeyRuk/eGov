# eGov SSO staging backend

Vercel provides the staging server-side boundary for the official eGov SSO widget. It stores the partner code and partner secret as encrypted project environment variables; the web page and Android client receive neither value.

`POST /api/auth/egov/exchange` accepts `{ "code": "<one-time exchange code>" }`, exchanges it with eGov, requests the authenticated citizen profile, and returns `{ "authenticated": true, "profile": { ... } }`. The function has no database, cache, session store, or application logging.

Required Vercel environment variables:

```text
EGOV_SSO_BASE_URL=https://hackathon-sso.e.gov.ph
EGOV_SSO_PARTNER_CODE=<registered partner code>
EGOV_SSO_PARTNER_SECRET=<registered partner secret>
EGOV_SSO_CLIENT_ID=<public widget client ID, if distinct from partner code>
EGOV_SSO_SCOPE=<optional scope>
```

The deployment is a test backend when the base URL and widget environment are `STAGING`, even if Vercel labels its stable URL as a Production deployment.
