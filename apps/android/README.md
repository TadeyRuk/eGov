# eGov Android SSO shell

This native WebView shell loads an HTTPS-hosted eGov SSO widget checker. It deliberately contains no partner secret, token, or profile persistence.

Build with an HTTPS checker URL:

```bash
gradle assembleDebug -PssoCheckerUrl=https://your-https-host/
```

The HTTPS backend receives the widget's exchange code and performs the token/profile exchange server-side. Do not use an HTTP localhost address or embed the partner secret in the APK.
