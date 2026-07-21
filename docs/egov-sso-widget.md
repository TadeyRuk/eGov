# eGov SSO widget

The eGov widget owns the mobile-number, OTP, security notice, and MPIN screens. The host application must provide the `egov-environment`, registered `egov-client-id`, named success callback, `#egov-sso-widget-button`, and `#egov-sso-widget-portal` elements.

After successful MPIN verification, the callback receives a short-lived exchange code. The client sends `{ "code": "…" }` to `POST /auth/egov/exchange`; only the server exchanges it for an access token and profile. Never put the partner secret in the website or Android app.

If OTP works but MPIN fails, the success callback and backend are not involved yet. Reproduce in Chrome and report a failure in both browsers to the widget/provider team as a staging account or session issue.
