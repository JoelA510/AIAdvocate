import { ExpoConfig, ConfigContext } from "expo/config";
import path from "path";
import dotenvFlow from "dotenv-flow";
import appJson from "./app.json";

// Load environment variables from .env files before Expo evaluates the config.
dotenvFlow.config({ path: path.resolve(__dirname), default_node_env: "development" });

type PublicEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  recaptchaSiteKey?: string;
  firebaseWebConfigJson?: string;
  lnfUrl?: string;
};

const REQUIRED_KEYS = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"] as const;

// An unexpanded "${VAR}" placeholder is as fatal as a missing value: EAS does
// NOT interpolate ${} references in eas.json env blocks — the literal text
// arrives here and would be baked into the binary (the v1.6–1.7 incident).
// Rejecting it at config-eval time fails the BUILD on the EAS builder instead
// of shipping a dead app.
//
// The two halves are kept apart because they are not equally suspicious. A
// "${" value is a mistake wherever it appears and is always fatal; a merely
// absent value is also the normal state of a fresh checkout, which matters for
// the metadata-only pass below.
function isBlank(value: string | undefined): boolean {
  return !value || value.trim() === "";
}

function isUnexpanded(value: string | undefined): boolean {
  return typeof value === "string" && value.includes("${");
}

function isUnusable(value: string | undefined): boolean {
  return isBlank(value) || isUnexpanded(value);
}

// eas-cli resolves the project by evaluating this config BEFORE it injects the
// environment chosen with --environment. On a clean checkout that made every
// project-scoped command (env:pull, env:exec, build:view, channel:view,
// update:list) fail on the guard below rather than on anything the operator
// could act on — and env:pull is precisely the command that would have supplied
// the missing values. The guard cannot simply be dropped: it is the only thing
// standing between a missing value and a shipped binary.
//
// Exactly two entry points resolve this config without turning the result into
// something that ships, and both are allowlisted by the process that loaded it:
//
//   - @expo/fingerprint's ExpoConfigLoader computes the runtime version.
//   - `expo config` prints the config and exits. This is the one eas-cli runs
//     to resolve the project before it injects --environment.
//
// The fingerprint loader is unconditional — it never throws here, for any
// reason. It SWALLOWS a config-eval error and emits a hash computed from a
// partial source set (55 sources rather than 122 — an entirely different
// runtime version) with nothing on stderr, so on that path "fatal" does not
// mean the operator sees an error, it means they are handed a fabricated
// runtime version that reads as "no shipped binary can take this update".
// Refusing to resolve is strictly worse than resolving, and there is nothing
// to protect: fingerprint.config.js skips ExpoConfigExtraSection, so
// extra.publicEnv is provably not an input and the hash is byte-identical
// across empty, placeholder and real values.
//
// Every other entry point (expo export, expo start, expo run:*, the export
// that `eas update` performs, expo-constants' getAppConfig.js and
// expo-updates' createUpdatesResources.js, which embed the config into the
// native projects) turns the result into something that ships and still
// throws. So does any unrecognized entry point — the default stays safe.
//
// EAS_BUILD_PROFILE means a real build is under way, where nothing may resolve
// degraded — not even `expo config`, which eas-cli also runs on the builder.
// It does not reach the fingerprint loader, which fingerprints on the builder
// too; a build missing these values still fails, loudly, on the paths above.
function isFingerprintResolution(): boolean {
  const entryPoint = process.argv[1];
  if (typeof entryPoint !== "string") return false;
  return entryPoint.replace(/\\/g, "/").includes("/@expo/fingerprint/");
}

function isMetadataOnlyResolution(): boolean {
  if (isFingerprintResolution()) return true;
  if (process.env.EAS_BUILD_PROFILE) return false;

  const [, entryPoint, subcommand] = process.argv;
  if (typeof entryPoint !== "string") return false;
  return entryPoint.replace(/\\/g, "/").includes("expo") && subcommand === "config";
}

// Every read of process.env in this file goes through a computed lookup rather
// than a literal `process.env.EXPO_PUBLIC_X` member expression. Under
// @expo/config the two are identical -- this module runs in Node and is never
// bundled -- but babel-preset-expo substitutes literal EXPO_PUBLIC_* reads with
// their transform-time value, so under jest (which does apply the preset) the
// literal form freezes to whatever was set when the module was transformed
// while the computed form stays live. Keeping every read computed makes the
// module behave the same in both, and testable in the second.
function readEnv(key: string): string | undefined {
  return process.env[key];
}

function optionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && !trimmed.includes("${") ? trimmed : undefined;
}

// Store-bound EAS profiles must never ship crash-blind: a production binary
// without a Sentry DSN was the observability blind spot that hid the
// v1.6–1.7 incident for weeks. EAS_BUILD_PROFILE is set on the EAS builder,
// so dev/preview/local evaluation is unaffected.
const STORE_PROFILES = new Set(["production", "internal-apk"]);

function assertStoreBuildHasSentryDsn(): void {
  // Not on the fingerprint path: that loader swallows a throw into a hash built
  // from a partial source set, so raising here would corrupt the runtime
  // version instead of failing the build. The build still fails on the paths
  // that embed the config into the native projects, where the error is visible.
  if (isFingerprintResolution()) return;

  const profile = process.env.EAS_BUILD_PROFILE;
  if (profile && STORE_PROFILES.has(profile) && isUnusable(readEnv("EXPO_PUBLIC_SENTRY_DSN"))) {
    throw new Error(
      `EXPO_PUBLIC_SENTRY_DSN is missing or unexpanded for EAS profile "${profile}". ` +
        `Production binaries must not ship crash-blind — set it in the EAS "production" ` +
        `environment (see DEPLOYMENT_GUIDE.md postmortem).`,
    );
  }
}

function collectPublicEnv(): PublicEnv {
  const unexpanded = REQUIRED_KEYS.filter((key) => isUnexpanded(readEnv(key)));
  if (unexpanded.length && !isFingerprintResolution()) {
    throw new Error(
      `Unexpanded environment variables for build: ${unexpanded.join(", ")}. ` +
        `A value containing "\${" means an eas.json env block is using \${VAR} ` +
        `references — EAS does not expand those, so the literal text would be ` +
        `baked into the bundle (see DEPLOYMENT_GUIDE.md postmortem).`,
    );
  }

  const missing = REQUIRED_KEYS.filter(
    (key) => isBlank(readEnv(key)) || isUnexpanded(readEnv(key)),
  );
  if (missing.length) {
    if (!isMetadataOnlyResolution()) {
      throw new Error(
        `Missing environment variables for build: ${missing.join(", ")}. ` +
          `EAS builds read these from EAS environment variables (the "production" ` +
          `environment); local dev reads mobile-app/.env, which \`eas env:pull\` writes.`,
      );
    }
    // Metadata-only: resolve so the caller can reach the project, but say so.
    // The values are left empty rather than faked — extra.publicEnv is skipped
    // by fingerprint.config.js (ExpoConfigExtraSection), so an empty one cannot
    // move the runtime version and mis-target an update.
    console.warn(
      `[app.config] ${missing.join(", ")} not set; resolving config for metadata only. ` +
        `Values are empty in extra.publicEnv — run \`eas env:pull <environment>\` before bundling.`,
    );
  }
  assertStoreBuildHasSentryDsn();

  return {
    // optionalEnv, not a bare trim: on the fingerprint path the throws above are
    // skipped, so this is what keeps a "${VAR}" literal out of extra.publicEnv.
    // On every other path the checks above already guarantee a usable value, so
    // this is the same string either way.
    supabaseUrl: optionalEnv(readEnv("EXPO_PUBLIC_SUPABASE_URL")) ?? "",
    supabaseAnonKey: optionalEnv(readEnv("EXPO_PUBLIC_SUPABASE_ANON_KEY")) ?? "",
    recaptchaSiteKey: optionalEnv(readEnv("EXPO_PUBLIC_RECAPTCHA_SITE_KEY")),
    firebaseWebConfigJson: optionalEnv(readEnv("EXPO_PUBLIC_FIREBASE_WEB_CONFIG")),
    lnfUrl: optionalEnv(readEnv("EXPO_PUBLIC_LNF_URL")),
  };
}

export default (_: ConfigContext): ExpoConfig => {
  const base = (appJson as { expo: ExpoConfig }).expo;
  const publicEnv = collectPublicEnv();

  return {
    ...base,
    extra: {
      ...(base.extra ?? {}),
      publicEnv,
      eas: base.extra?.eas,
      router: base.extra?.router,
    },
  };
};
