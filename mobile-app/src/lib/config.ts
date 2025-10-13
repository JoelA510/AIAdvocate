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
  openstatesApiKey: string;
  locationIqApiKey: string;
  recaptchaSiteKey?: string;
  firebaseWebConfigJson?: string;
};

type PublicEnvPayload = Partial<AppConfig> & {
  lnfUrl?: string;
};

const REQUIRED_FIELDS: Array<keyof AppConfig> = [
  "supabaseUrl",
  "supabaseAnonKey",
  "openstatesApiKey",
  "locationIqApiKey",
];

let config: AppConfig | null = null;

function resolvePublicEnv(): PublicEnvPayload | null {
  const extraLayers = [
    Constants.expoConfig?.extra,
    (Constants.manifest as any)?.extra,
    (Updates.manifest as any)?.extra,
    (Updates.manifest2 as any)?.extra,
  ];

  for (const layer of extraLayers) {
    if (layer?.publicEnv && typeof layer.publicEnv === "object") {
      return layer.publicEnv as PublicEnvPayload;
    }
  }

  return null;
}

function buildConfigFromPublicEnv(): AppConfig {
  const source =
    resolvePublicEnv() ??
    Object.fromEntries(Object.values(REQUIRED_FIELDS).map((field) => [field, null]));

  const missing = REQUIRED_FIELDS.filter(
    (field) => !source[field] || String(source[field]).trim().length === 0,
  );

  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(
        ", ",
      )}. Ensure EXPO_PUBLIC_* values are defined in app.config.ts at build time.`,
    );
  }

  return {
    supabaseUrl: String(source.supabaseUrl).trim(),
    supabaseAnonKey: String(source.supabaseAnonKey).trim(),
    openstatesApiKey: String(source.openstatesApiKey).trim(),
    locationIqApiKey: String(source.locationIqApiKey).trim(),
    recaptchaSiteKey: source.recaptchaSiteKey?.trim(),
    firebaseWebConfigJson: source.firebaseWebConfigJson?.trim(),
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

