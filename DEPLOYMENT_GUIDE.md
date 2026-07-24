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

- **Credentials**: EAS will ask to handle keystores for you. Select **Yes** to let EAS manage them securely.
- **Wait**: The build will take 10-20 minutes.
- **Download**: Once finished, download the `.aab` file from the link provided.

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

> **Important**: `eas submit` uploads to the **Internal testing** track (`submit.production.android.track: "internal"` in `eas.json`) — it does **not** go live. After smoke-testing the internal build, promote it in Play Console: **Testing > Internal testing > Promote release > Production**. Smoke-test every internal build before promoting: launch past the splash screen, push notifications, sign-in, hCaptcha, popup menus, toasts, and the admin login keyboard.
>
> **Startup diagnostics**: the 1.7.0 builds hung on the native splash screen on-device, and none of the native suspects were to blame — the cause was the `eas.json` `${}` placeholder incident (see postmortem below). That bug was present in _every_ bisect build, which is why flipping native flags never produced a signal: each trial was "fatally broken config + one flag off", so the flag under test could never matter. R8, the Sentry AGP, edge-to-edge, and expo-updates are therefore **exonerated as the cause of that incident**. Note the precise claim: the bisect withdrew the evidence _against_ these flags, it did not produce evidence _for_ them. No build of this app has ever been observed launching on a device with them on — every binary of that era was poisoned — so the ladder below is an experiment with a strong prior, not a restoration of verified-good settings.
>
> Diagnostics now work like this: the 8s splash failsafe lives at the **entry** (`mobile-app/index.js` → `src/boot/splash-failsafe.js`, armed before any other module evaluates) and Sentry initializes from the entry **before** the app graph. **If the splash hides at ~8s but the screen is blank/dead**, the JS graph threw during module evaluation — check Sentry (the crash now reaches it) or `adb logcat`. **If the splash persists past ~10s**, JS never started at all — suspect the native side (bad bundle packaging, native module init crash). A config fault specifically renders the localized **Configuration Error** screen rather than hanging.
>
> **Re-enable ladder (all BEFORE the SDK 54 upgrade** — piling them onto the upgrade makes any regression unattributable):
>
> 1. **Batch A** — _implemented, not device-verified_: expo-updates re-enabled, edge-to-edge re-enabled, Sentry Android Gradle Plugin re-enabled, and the vestigial `ios.useFrameworks: "static"` dropped (it existed for `@react-native-firebase`, removed in PR #65; only `expo-notifications` remains, and it does not need static frameworks).
> 2. **Batch B** — _implemented, not device-verified_: R8/Proguard + `shrinkResources` restored via `expo-build-properties` (android block only — the iOS `useFrameworks` entry stays dropped). Kept **solo** because it is the only one that can break the app subtly at _runtime_ while the build stays green (R8 strips/renames anything reached reflectively). Needs a full smoke test, not a launch check: every tab, bill detail, rep lookup, share, TTS, push, language switch.
>
> No custom `extraProguardRules` were added: every native dependency in this app (React Native, the Expo modules, Sentry, reanimated, gesture-handler, webview, svg, async-storage) ships its own consumer ProGuard rules, and the JS lives in a Hermes bundle that R8 never touches. If the smoke test surfaces a strip-related crash, add a targeted `-keep` via `expo-build-properties.android.extraProguardRules` rather than disabling R8 wholesale. Note that with R8 on, the Sentry AGP's ProGuard **mapping** upload stops being a no-op, so Java/Kotlin frames should symbolicate — that is the signal the AGP was actually injected.
>
> **Honest accounting of the batching risk.** An earlier draft of this section claimed "none of these can cause a boot hang" and that "Sentry AGP fails the build loudly". **Both are false**:
>
> - **expo-updates can hang boot.** `UpdatesPackage.kt` calls `UpdatesController.instance.launchAssetFile`, which is `runBlocking { startupFinishedDeferred.await() }` — it blocks the **native** launch before JS starts, and `launchWaitMs` bounds only the remote fetch, not the whole startup procedure. PR #70's own commit message said exactly this. The entry splash failsafe **cannot** cover it, because that failsafe is JS and JS has not started yet. This is the one Batch A item with a real boot-hang failure mode.
> - **Sentry AGP can fail silently.** `withSentry.js` wraps the AGP wiring in `try/catch` and only `warnOnce()`s, and `withSentryAndroidGradlePlugin.js` warns and returns the file unmodified if its `dependencies {` regex misses. A green build does **not** prove the AGP was injected — confirm by watching native frames symbolicate in Sentry.
>
> So Batch A ships three native-affecting changes plus an iOS linkage change with no per-item device gate. That is a deliberate speed/attribution tradeoff, not a safety proof. **If a Batch A build hangs on the splash, set `updates.enabled` back to `false` first** — it is the only item that produces that symptom.
>
> **Expected visual change to verify on device (edge-to-edge).** The scaffold already consumes safe-area insets (`HeaderBanner` uses `insets.top + 24`, `FooterNav` uses `Math.max(bottom, 12)`) **and** most screens add `insets.top`/`insets.bottom` again inside it (`app/(tabs)/index.tsx`, `lnf.tsx`, `active.tsx`, `saved.tsx`, `advocacy.tsx`, `legislator/[id].tsx`). On Android those insets were `0` before edge-to-edge, so the duplication was invisible; now it is real. **Expect extra blank bands under the header and above the footer — fix by removing the per-screen inset padding, not by reverting edge-to-edge.** Also check the two pre-provider screens in `_layout.tsx` (Configuration Error, pre-ready logo): they render outside `SafeAreaProvider` with a hardcoded `paddingTop: 64` and no `<StatusBar>`, so verify them on a large-cutout device.
>
> **Edge-to-edge is not optional long-term**: Android 16 / `targetSdkVersion` 36 removes the opt-out entirely (on API 35 it is still opt-out-able via `android:windowOptOutEdgeToEdgeEnforcement`), and Play's API 36 deadline lands with SDK 54 — see the deadline note in Troubleshooting.
>
> **Sentry AGP requires `SENTRY_AUTH_TOKEN`** in the EAS environment used by the build, or the upload task fails the build. It is present in the **production** environment (which `production` and `internal-apk` both pin); `development`/`preview` set `SENTRY_DISABLE_AUTO_UPLOAD=true` in `eas.json`, which the plugin's `shouldSentryAutoUpload()` gate respects. **Local release builds** (`npx expo run:android --variant release`) set neither, so export `SENTRY_DISABLE_AUTO_UPLOAD=true` first or Gradle fails on an unauthenticated upload. `internal-apk` sets `SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD=true` so throwaway diagnostic builds don't push hundreds of MB of `.so` symbols.

---

## 🍎 iOS (Apple App Store)

### 1. Build the IPA

The `.ipa` file is the format required by Apple.

Run the following command in the `mobile-app` directory:

```bash
eas build --platform ios --profile production
```

- **Credentials**: EAS will ask to log in to your Apple Developer account. It will handle certificates and provisioning profiles automatically.
- **Wait**: The build will take 15-25 minutes.

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
eas update --branch production --environment production --message "Fix: summary persistence and UI refinements"
```

> ### ⚠️ `--environment production` is mandatory, not optional
>
> An OTA update carries its own `extra.publicEnv` — the **Supabase URL, anon key and Sentry DSN baked from whatever environment the publish ran in** — and `expo-constants` resolves `Constants.expoConfig` from the _update's_ manifest, which `src/lib/config.ts` reads first. Two things make a mistake here fleet-wide and silent:
>
> - `fingerprint.config.js` deliberately skips `ExpoConfigExtraSection`, so changed credentials do **not** re-segment the runtime version — a wrong-environment update targets every install.
> - `app.config.ts`'s crash-blind guard keys on `EAS_BUILD_PROFILE`, which `eas update` never sets, so it does **not** fire on this path.
>
> Publishing from a laptop whose `.env` points at staging therefore silently repoints the entire production fleet to staging on next cold start, and can disable Sentry with only a `console.warn`. `--environment production` makes EAS supply the same values the production builder uses. Verify after publishing: `eas update:list --branch production`, and confirm the published `extra.publicEnv` carries the production Supabase host.
>
> ### Rolling back a bad update
>
> expo-updates' automatic `ErrorRecovery` only triggers on a **fatal JS error at launch** — a bundle that renders blank, breaks a screen, or points at the wrong backend will **not** self-revert. Roll back explicitly:
>
> ```bash
> eas update:list --branch production          # find the last-good update group
> eas update:republish --group <GROUP_ID>      # re-publish it as the newest update
> ```
>
> Users pick the rollback up on their next cold start. Note the two-cold-start latency in both directions: nothing in this app calls `Updates.reloadAsync()`, so a downloaded update is applied on the _following_ launch.
>
> **Known gap — updates are not code-signed.** No `codeSigningCertificate` is configured, so anyone who can run `eas update` against this project can execute arbitrary JS on every install with no store review and no on-device signature check. Given this app's users, treat EAS account access as production-credential-grade, and consider `expo-updates` code signing before widening publish access.

**How targeting works (important):** an update only reaches binaries whose **runtime version** matches. This project uses the `fingerprint` runtime policy (`app.json`) — the runtime version is a hash of everything native-relevant (dependencies, config plugins, native-affecting `app.json` fields). Practical rules:

- **JS/asset-only change** → fingerprint unchanged → `eas update` reaches current builds. ✅
- **Any native-affecting change** (add/upgrade a dependency with native code, change plugins or native `app.json` fields) → new fingerprint → existing installs **cannot** receive the update; ship a store build first (Steps 1 & 2 above), then OTA works again for the new builds.
- Run `npx expo-updates fingerprint:generate --platform android` before/after a change (or `eas fingerprint:compare`) if you're unsure whether it re-segmented.
- `fingerprint.config.js` excludes the whole `extra` config section (env-injected values plus the static EAS project/router identifiers) and the `version` string from the hash, so env differences and marketing-version bumps do **not** break OTA targeting. A genuine EAS project migration (changing `extra.eas.projectId`) is _not_ caught by the fingerprint either — treat that as a native change and ship a full build. Publish updates from an environment where the config evaluates (`.env` present), or the command fails.

> **Migration note (v1.5.0 and earlier)**: builds shipped before the fingerprint policy embed the static runtime `"1.0.0"`. Updates published from current `main` can never reach them. To hotfix that fleet, check out the last `runtimeVersion: "1.0.0"` commit (`ea377ec` or earlier) and publish from there; otherwise just ship the next store build.
>
> **Migration note (the broken-era fleet)**: `updates.enabled: false` was introduced only in `578a79f` (2026-07-16, PR #70) — **not** across the whole broken era. Binaries built before that commit shipped with updates _enabled_ (the key was absent and defaults to `true`), so the era splits into three targeting classes: builds before `e124e29` (2026-07-09) embed the static runtime `"1.0.0"` (see the note above); builds between `e124e29` and `578a79f` have fingerprint runtime versions and are OTA-capable from their matching commit; only builds from `578a79f` onward — which includes **vc13, currently live in production** — have OTA switched off entirely and cannot be reached at all.
>
> Do not trust this paragraph over the tooling: `eas.json` sets `appVersionSource: "remote"`, so versionCodes live on EAS, not in the repo. Resolve the actual mapping with `eas build:list --platform android`, `eas channel:view production`, and `eas update:list`.

---

## 🧨 Postmortem: the eas.json `${}` placeholder incident (v1.6–v1.7)

Every EAS binary built between mid-June and July 20, 2026 (Android vc7–vc12 and the rejected iOS builds) died **before first render**: Android froze on the native splash forever, iOS crashed on launch, and Sentry showed zero sessions. Weeks were spent bisecting native flags (R8, edge-to-edge, expo-updates, New Architecture) — all innocent.

**Root cause:** `eas.json`'s production profile declared

```json
"env": { "EXPO_PUBLIC_SUPABASE_URL": "${EXPO_PUBLIC_SUPABASE_URL}", … }
```

**EAS does not interpolate `${VAR}` syntax in `eas.json` — the literal text is passed through as the value.** Worse, build-profile `env` **overrides** the real values from the EAS "production" environment (the build log even says so: _"values from the build profile configuration will be used"_). So the builder evaluated `app.config.ts` with `EXPO_PUBLIC_SUPABASE_URL='${EXPO_PUBLIC_SUPABASE_URL}'`, baked that literal into `extra.publicEnv`, and Metro inlined the literal DSN into the bundle. At runtime, `createClient()` throws `Invalid supabaseUrl` **at module scope** → the entire bundle dies during import evaluation → eternal splash (Android) / launch crash (iOS) / no Sentry (the DSN was also a placeholder). Confirmed by unzipping the built APK: `assets/app.config` contained the placeholder strings verbatim.

It went unnoticed because local dev (`expo start`) loads real values from `.env` via dotenv-flow — the app only broke in EAS-built binaries.

**Rules, so this never recurs:**

1. **Never use `${VAR}` references in `eas.json` `env` blocks.** Real `EXPO_PUBLIC_*` values live as **EAS environment variables** (production environment; `eas env:list production`). Build profiles should list only genuinely static values (e.g. `EXPO_PUBLIC_LNF_URL`) — anything listed in profile `env` clobbers the EAS environment value of the same name. This is **enforced in CI**: `scripts/check-public-env.js` fails if any eas.json env value contains `${` — including per-platform `android`/`ios` env blocks — and its self-test runs first on every `check:public-env` invocation.
2. Every profile pins `"environment"` explicitly (`production` for production/internal-apk, `development`/`preview` for the others), so which EAS environment feeds a build is never implicit.
3. The build **fails on the EAS builder** if a required `EXPO_PUBLIC_*` value is missing **or contains `${`** (`app.config.ts` `collectPublicEnv()`), so a placeholder can no longer ship inside a binary. Store-bound profiles (`production`, `internal-apk`) additionally fail the build if `EXPO_PUBLIC_SENTRY_DSN` is unusable — production binaries must never ship crash-blind. (Consequence for local CLI triggers: export a dummy `EXPO_PUBLIC_SENTRY_DSN` alongside the dummy Supabase vars if your trigger environment evaluates the config with `EAS_BUILD_PROFILE` set.)
4. Boot is armored in layers, and they must stay: `mobile-app/index.js` imports `src/boot/splash-failsafe.js` first (arms a **require-free** 8s timer — a broken module graph cannot disarm it; requires happen inside the callback), then `src/boot/init-sentry.js` (Sentry initializes **before** the app graph, so module-scope throws are reported — the incident's zero-Sentry blind spot), then `expo-router/entry`. `src/lib/supabase.ts`/`.native.ts` fall back to an inert sentinel client instead of throwing at module scope, which lets `_layout.tsx` render its localized **Configuration Error** screen (`initConfig()` re-throws inside a try/catch). Runtime guards in `src/lib/config.ts`/`sentry.ts` treat any value containing `${` as missing, and `app/(tabs)/lnf.tsx` guards its direct `process.env` read the same way.
5. After any change to env plumbing, verify the artifact, not the config: download the build, `unzip`, and check `assets/app.config` → `extra.publicEnv` contains real values (never `${`), and `grep -a '\${EXPO_PUBLIC' assets/index.android.bundle` finds nothing.

---

## 🛠 Troubleshooting

- **Build Fails?** Check the logs provided in the Expo dashboard link.
- **Version Code Error?** The two version concepts live in different places:
  - **Build counters** (`versionCode`/`buildNumber`) are managed remotely by EAS (`cli.appVersionSource: "remote"` in `eas.json`) and auto-increment on every production build. Do not add these fields to `app.json`; if a counter ever needs manual correction, use `eas build:version:set`.
  - **User-facing version** (e.g. `1.7.0`) is `expo.version` in `mobile-app/app.json` — bump it there for each release, and keep `mobile-app/package.json`'s `version` in sync. Do **not** "simplify" by deriving `expo.version` from `package.json` in `app.config.ts`: the raw `package.json` file is itself a fingerprint source (only the _evaluated config's_ version field is skipped), so bumps would change the runtime fingerprint and orphan OTA targeting — measured, not theoretical.
- **Sentry**: `EXPO_PUBLIC_SENTRY_DSN` (EAS Environment Variables, Production, Plain text) enables error/crash reporting; `SENTRY_AUTH_TOKEN` (EAS project secret) authorizes the `@sentry/react-native/expo` plugin's build-time JS source-map upload. **Both must exist as EAS values before building** — a production build with the plugin present but no `SENTRY_AUTH_TOKEN` fails outright (the upload is a build-graph-finalizing step on both platforms, not an optional best-effort step). `development`/`preview` profiles set `SENTRY_DISABLE_AUTO_UPLOAD=true` in `eas.json` since they have no token. `experimental_android.enableAndroidGradlePlugin` is **enabled** (Batch A), which uploads native `.so` debug symbols so C++/Hermes frames symbolicate; note that a green build does not prove it was injected (the plugin only `warnOnce()`s on injection failure) — confirm by seeing a native frame symbolicate in Sentry. `SENTRY_AUTH_TOKEN` is stored as an **environment-scoped variable in the EAS `production` environment** (`eas env:list production`), not as a legacy project-wide secret.
- **Play Data Safety — email collection**: the store binaries collect **no** email addresses. Staff/admin login (Supabase email+password) is web-only: the real screens live in `src/features/admin/*.web.tsx` and Metro bundles the native stubs (`*.tsx` → `AdminWebOnly`) into iOS/Android instead. Keep it that way — moving admin code back into a shared path would re-trigger the Data Safety mismatch flag. Verify after native-facing changes with `npx expo export --platform android` and grep the bundle for `manage-admin-users` (must be absent).
- **Before the SDK 54 upgrade** (required for Play's API 36 deadline, ~Aug 2026): audit tablet/foldable layouts — Android 16 ignores the portrait orientation lock on large screens, so every screen must tolerate landscape/resized windows.
