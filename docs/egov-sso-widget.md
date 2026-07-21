# eGov SSO widget

The eGov widget owns the mobile-number, OTP, security notice, and MPIN screens. The host application must provide the `egov-environment`, registered `egov-client-id`, named success callback, `#egov-sso-widget-button`, and `#egov-sso-widget-portal` elements.

After successful MPIN verification, the callback receives a short-lived exchange code. The client sends `{ "code": "…" }` to `POST /auth/egov/exchange`; only the server exchanges it for an access token and profile. Never put the partner secret in the website or Android app.

If OTP works but MPIN fails, the success callback and backend are not involved yet. Reproduce in Chrome and report a failure in both browsers to the widget/provider team as a staging account or session issue.

## Shared demo backend

The deployable backend is the repository-root `api/` directory. It intentionally keeps no session, token, exchange code, profile, cache, or log record. `POST /api/auth/egov/exchange` accepts the one-time exchange code from either client, exchanges it with eGov using the server-only partner credentials, then returns the resulting profile only in that response.

For Vercel, create these **server-side environment variables** (never browser/Android build variables):

```
EGOV_SSO_BASE_URL=https://hackathon-sso.e.gov.ph
EGOV_SSO_PARTNER_CODE=your_registered_partner_code
EGOV_SSO_PARTNER_SECRET=your_registered_partner_secret
EGOV_SSO_CLIENT_ID=your_registered_widget_client_id
EGOV_SSO_SCOPE=
```

The site is served from `apps/web/public`; its `/api/config` route exposes only the client ID needed to initialize the public widget. The partner code and partner secret never leave Vercel. Before deploying, register the final Vercel HTTPS origin with the eGov hackathon team/dashboard if their client registration has an allowed-origin setting.

After a Vercel deployment is available, build the Android demo with its public client ID and that backend origin:

```
cd apps/android
./gradlew assembleDebug \
  -PssoClientId=your_registered_widget_client_id \
  -PssoApiBaseUrl=https://your-project.vercel.app
```
