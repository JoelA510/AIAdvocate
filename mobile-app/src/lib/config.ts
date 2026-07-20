// mobile-app/src/lib/config.ts

import Constants from "expo-constants";
import * as Updates from "expo-updates";

/**
 * Centralized runtime config for the app (web + native).
 * Values are injected at build time through `app.config.ts`.
 */

export type AppConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  recaptchaSiteKey?: string;
  firebaseWebConfigJson?: string;
  lnfUrl?: string;
};

type PublicEnvPayload = Partial<AppConfig> & {
  lnfUrl?: string;
};

const REQUIRED_FIELDS: (keyof AppConfig)[] = ["supabaseUrl", "supabaseAnonKey"];

let config: AppConfig | null = null;

function resolvePublicEnv(): PublicEnvPayload | null {
  const manifest = Updates.manifest as any;
  const extraLayers = [
    Constants.expoConfig?.extra,
    (Constants.manifest as any)?.extra,
    manifest?.extra,
  ];

  for (const layer of extraLayers) {
    if (layer?.publicEnv && typeof layer.publicEnv === "object") {
      return layer.publicEnv as PublicEnvPayload;
    }
  }

  return null;
}

// An unexpanded "${VAR}" placeholder is as fatal as a missing value (it is
// not a URL/key, and supabase-js throws on it at module scope) but passes a
// plain truthiness check. This shipped v1.6–1.7 as an app that died before
// first render: eas.json build-profile env used "${EXPO_PUBLIC_*}" syntax,
// which EAS does NOT interpolate — the literal text reached the bundle.
function isUnresolved(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0 || value.includes("${");
}

function optionalValue(value?: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed && !trimmed.includes("${") ? trimmed : undefined;
}

function buildConfigFromPublicEnv(): AppConfig {
  const source =
    resolvePublicEnv() ?? Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, null]));

  const missing = REQUIRED_FIELDS.filter((field) => isUnresolved(source[field]));

  if (missing.length > 0) {
    throw new Error(
      `Missing or unexpanded environment variables: ${missing.join(
        ", ",
      )}. Ensure EXPO_PUBLIC_* values are defined at build time (EAS environment variables for EAS builds, mobile-app/.env for local dev) and never written as "\${VAR}" references in eas.json — EAS does not interpolate those.`,
    );
  }

  return {
    supabaseUrl: String(source.supabaseUrl).trim(),
    supabaseAnonKey: String(source.supabaseAnonKey).trim(),
    recaptchaSiteKey: optionalValue(source.recaptchaSiteKey),
    firebaseWebConfigJson: optionalValue(source.firebaseWebConfigJson),
    lnfUrl: optionalValue(source.lnfUrl),
  };
}

/**
 * Eagerly initialize config (call once during app boot).
 * Optionally pass overrides (handy for tests).
 */
export function initConfig(overrides?: Partial<AppConfig>): AppConfig {
  if (!config) {
    config = { ...buildConfigFromPublicEnv(), ...(overrides ?? {}) };
  }
  return config;
}

/**
 * Access config anywhere. Lazily builds from envs on first call.
 */
export function getConfig(): AppConfig {
  if (!config) {
    config = buildConfigFromPublicEnv();
  }
  return config;
}

export function setConfig(overrides: AppConfig) {
  config = { ...overrides };
}
