# Android eGovPH SSO test app

Minimal Java Android app for the official staging SSO widget. The widget page is bundled in the APK, so the app does not depend on a laptop-hosted website.

The app receives the one-time exchange code only long enough to report success. It does not display, log, persist, or exchange the code, and it never contains the partner secret.

## Build

Set the public SSO client ID through a Gradle property or environment variable:

```bash
./gradlew assembleDebug -PssoClientId=YOUR_CLIENT_ID
```

The resulting APK is `app/build/outputs/apk/debug/app-debug.apk`.

## Install on a connected device

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Complete mobile number/email, OTP, and MPIN only inside the official widget. Do not place the partner secret in this Android project.
