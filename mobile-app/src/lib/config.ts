// mobile-app/src/lib/config.ts

/**
 * Centralized runtime config for the app (web + native).
 * - Reads EXPO_PUBLIC_* env vars on first access
 * - Throws a clear error listing any missing keys
 * - Can be eagerly initialized at app boot via initConfig()
 */

export type AppConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  openstatesApiKey: string;
  locationIqApiKey: string;
  /** Optional extras if you use them */
  recaptchaSiteKey?: string;
  firebaseWebConfigJson?: string;
};

let config: AppConfig | null = null;

const REQUIRED_KEYS = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_OPENSTATES_API_KEY",
  "EXPO_PUBLIC_LOCATIONIQ_API_KEY",
] as const;

function buildFromEnv(): AppConfig {
  const env = process.env as Record<string, string | undefined>;

  const missing = REQUIRED_KEYS.filter((k) => !env[k] || String(env[k]).trim() === "");
  if (missing.length > 0) {
    // Throw a helpful message so web dev surfaces exactly what's wrong
    throw new Error(
      `Missing environment variables: ${missing.join(
        ", ",
      )}. Ensure they are set in mobile-app/.env (EXPO_PUBLIC_*) and that you restarted the dev server.`,
    );
  }

  // Safe non-null by this point
  const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  const openstatesApiKey = env.EXPO_PUBLIC_OPENSTATES_API_KEY!;
  const locationIqApiKey = env.EXPO_PUBLIC_LOCATIONIQ_API_KEY!;

  const recaptchaSiteKey = env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY;
  const firebaseWebConfigJson = env.EXPO_PUBLIC_FIREBASE_WEB_CONFIG;

  return {
    supabaseUrl: supabaseUrl.trim(),
    supabaseAnonKey: supabaseAnonKey.trim(),
    openstatesApiKey: openstatesApiKey.trim(),
    locationIqApiKey: locationIqApiKey.trim(),
    recaptchaSiteKey: recaptchaSiteKey?.trim(),
    firebaseWebConfigJson: firebaseWebConfigJson?.trim(),
  };
}

/**
 * Eagerly initialize config (call once during app boot).
 * Optionally pass overrides (handy for tests).
 */
export function initConfig(overrides?: Partial<AppConfig>): AppConfig {
  if (!config) {
    config = { ...buildFromEnv(), ...(overrides ?? {}) };
  }
  return config;
}

/**
 * Access config anywhere. Lazily builds from envs on first call.
 */
export function getConfig(): AppConfig {
  if (!config) {
    config = buildFromEnv();
  }
  return config;
}
