# Java eGovPH SSO APK

Standalone Java Android test app migrated from the `java-andrew` branch. It bundles the official staging SSO widget page inside the APK and does not depend on the repository's web app.

The widget handles mobile/email, OTP, and MPIN. The APK receives the one-time exchange code in memory. If `EGOV_SSO_API_BASE_URL` is configured, it immediately sends the code to the serverless backend for token/profile authentication. The partner secret and temporary access token never enter the APK.

## Build

From the repository root:

```bash
pnpm build:android-sso-java
```

Configuration is read from the ignored root `.env`:

- `EGOV_SSO_CLIENT_ID`, falling back to `EGOV_SSO_PARTNER_CODE`
- `EGOV_SSO_API_BASE_URL`, optional HTTPS deployment containing `/api/auth/egov/exchange`

APK output:

```text
apps/android-sso-java/app/build/outputs/apk/debug/app-debug.apk
```

Install with ADB when a permitted test device is connected:

```bash
pnpm install:android-sso-java
```

Alternatively, transfer the APK and install it manually without USB debugging. Complete all credentials only inside the official eGovPH widget.
