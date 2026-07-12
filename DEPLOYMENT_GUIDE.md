# Deployment Guide: Google Play Store & Apple App Store

This guide details the steps to build and submit the **AI Advocate** mobile application to both the Google Play Store and Apple App Store using Expo EAS (Application Services).

## Prerequisites

1.  **Expo Account**: Ensure you are logged in to your Expo account.
    ```bash
    eas login
    ```
2.  **Apple Developer Account**: Required for iOS submission ($99/year).
3.  **Google Play Console Account**: Required for Android submission ($25 one-time fee).
4.  **EAS CLI**: Ensure you have the latest version.
    ```bash
    npm install -g eas-cli
    ```
5.  **Environment variables (local CLI builds/updates only)**: evaluating the app config throws unless `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set — copy `mobile-app/.env.example` to `mobile-app/.env` and fill them in. Dashboard-triggered EAS builds use the EAS **Environment variables** store (Production environment) instead and need no local `.env`.

> **Note**: Builds and submits can also be run entirely from the [EAS dashboard](https://expo.dev) (Builds → Create a build, with the GitHub-linked repo and Root Directory `mobile-app`) — no terminal required. The CLI commands below are the equivalent local workflow.

---

## 🤖 Android (Google Play Store)

### 1. Build the App Bundle (AAB)
The Android App Bundle (`.aab`) is the format required by Google Play.

Run the following command in the `mobile-app` directory:

```bash
eas build --platform android --profile production
```

*   **Credentials**: EAS will ask to handle keystores for you. Select **Yes** to let EAS manage them securely.
*   **Wait**: The build will take 10-20 minutes.
*   **Download**: Once finished, download the `.aab` file from the link provided.

### 2. Submit to Google Play Console

#### First Time Submission (Manual)
1.  Go to the [Google Play Console](https://play.google.com/console).
2.  Create a new app.
3.  Navigate to **Testing > Internal testing** (or Production).
4.  Create a new release.
5.  Upload the `.aab` file you downloaded.
6.  Complete the store listing details (screenshots, description, privacy policy).
7.  Submit for review.

#### Subsequent Updates (Automated)
Once the first build is manually uploaded, you can automate future submissions:

```bash
eas submit -p android
```

> **Important**: `eas submit` uploads to the **Internal testing** track (`submit.production.android.track: "internal"` in `eas.json`) — it does **not** go live. After smoke-testing the internal build, promote it in Play Console: **Testing > Internal testing > Promote release > Production**. The first R8-minified build (Proguard/shrinking enabled since v1.5) especially deserves that internal pass: check push notifications, sign-in, hCaptcha, popup menus, toasts, and the admin login keyboard before promoting.

---

## 🍎 iOS (Apple App Store)

### 1. Build the IPA
The `.ipa` file is the format required by Apple.

Run the following command in the `mobile-app` directory:

```bash
eas build --platform ios --profile production
```

*   **Credentials**: EAS will ask to log in to your Apple Developer account. It will handle certificates and provisioning profiles automatically.
*   **Wait**: The build will take 15-25 minutes.

### 2. Submit to App Store Connect

#### Automated Submission (Recommended)
You can submit directly from the CLI after the build, from the EAS dashboard, or separately:

```bash
eas submit -p ios
```

Submission is non-interactive: `eas.json` pins the App Store Connect app via `ascAppId` and sources store metadata from `mobile-app/store.config.json` (`metadataPath`). Treat `store.config.json` as the source of truth for title/subtitle/description/keywords — edit it in the repo rather than hand-editing App Store Connect, or the two will diverge. EAS uploads the binary to **TestFlight** in App Store Connect.

#### Finalize in App Store Connect
1.  Go to [App Store Connect](https://appstoreconnect.apple.com/).
2.  Navigate to **My Apps > AI Advocate**.
3.  Go to **TestFlight** to verify the build is processing.
4.  Once processed, go to the **App Store** tab and select the build.
5.  Update screenshots if needed (screenshots are not managed by `store.config.json`).
6.  Click **Submit for Review**.

---

## 🔄 OTA Updates (Over-The-Air)

For small JavaScript/asset-only changes, you can push an update to users without a full store build:

```bash
eas update --branch production --message "Fix: summary persistence and UI refinements"
```

**How targeting works (important):** an update only reaches binaries whose **runtime version** matches. This project uses the `fingerprint` runtime policy (`app.json`) — the runtime version is a hash of everything native-relevant (dependencies, config plugins, native-affecting `app.json` fields). Practical rules:

*   **JS/asset-only change** → fingerprint unchanged → `eas update` reaches current builds. ✅
*   **Any native-affecting change** (add/upgrade a dependency with native code, change plugins or native `app.json` fields) → new fingerprint → existing installs **cannot** receive the update; ship a store build first (Steps 1 & 2 above), then OTA works again for the new builds.
*   Run `npx expo-updates fingerprint:generate --platform android` before/after a change (or `eas fingerprint:compare`) if you're unsure whether it re-segmented.
*   `fingerprint.config.js` excludes the whole `extra` config section (env-injected values plus the static EAS project/router identifiers) and the `version` string from the hash, so env differences and marketing-version bumps do **not** break OTA targeting. A genuine EAS project migration (changing `extra.eas.projectId`) is *not* caught by the fingerprint either — treat that as a native change and ship a full build. Publish updates from an environment where the config evaluates (`.env` present), or the command fails.

> **Migration note (v1.5.0 and earlier)**: builds shipped before the fingerprint policy embed the static runtime `"1.0.0"`. Updates published from current `main` can never reach them. To hotfix that fleet, check out the last `runtimeVersion: "1.0.0"` commit (`ea377ec` or earlier) and publish from there; otherwise just ship the next store build.

---

## 🛠 Troubleshooting

*   **Build Fails?** Check the logs provided in the Expo dashboard link.
*   **Version Code Error?** The two version concepts live in different places:
    *   **Build counters** (`versionCode`/`buildNumber`) are managed remotely by EAS (`cli.appVersionSource: "remote"` in `eas.json`) and auto-increment on every production build. Do not add these fields to `app.json`; if a counter ever needs manual correction, use `eas build:version:set`.
    *   **User-facing version** (e.g. `1.7.0`) is `expo.version` in `mobile-app/app.json` — bump it there for each release, and keep `mobile-app/package.json`'s `version` in sync. Do **not** "simplify" by deriving `expo.version` from `package.json` in `app.config.ts`: the raw `package.json` file is itself a fingerprint source (only the *evaluated config's* version field is skipped), so bumps would change the runtime fingerprint and orphan OTA targeting — measured, not theoretical.
*   **Sentry**: `EXPO_PUBLIC_SENTRY_DSN` (EAS Environment Variables, Production, Plain text) enables error/crash reporting; `SENTRY_AUTH_TOKEN` (EAS project secret) authorizes the `@sentry/react-native/expo` plugin's build-time upload (JS source maps always; R8 `mapping.txt` too, via `experimental_android.enableAndroidGradlePlugin` in `app.json`). **Both must exist as EAS values before building** — a production build with the plugin present but no `SENTRY_AUTH_TOKEN` fails outright (the upload is a build-graph-finalizing step on both platforms, not an optional best-effort step). `development`/`preview` profiles set `SENTRY_DISABLE_AUTO_UPLOAD=true` in `eas.json` since they have no token. Play Console crash reports are unaffected either way (the R8 mapping is embedded in the AAB).
*   **Play Data Safety — email collection**: the store binaries collect **no** email addresses. Staff/admin login (Supabase email+password) is web-only: the real screens live in `src/features/admin/*.web.tsx` and Metro bundles the native stubs (`*.tsx` → `AdminWebOnly`) into iOS/Android instead. Keep it that way — moving admin code back into a shared path would re-trigger the Data Safety mismatch flag. Verify after native-facing changes with `npx expo export --platform android` and grep the bundle for `manage-admin-users` (must be absent).
*   **Before the SDK 54 upgrade** (required for Play's API 36 deadline, ~Aug 2026): audit tablet/foldable layouts — Android 16 ignores the portrait orientation lock on large screens, so every screen must tolerate landscape/resized windows.
