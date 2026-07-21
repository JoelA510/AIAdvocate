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
function isUnusable(value: string | undefined): boolean {
  return !value || value.trim() === "" || value.includes("${");
}

function optionalEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && !trimmed.includes("${") ? trimmed : undefined;
}

function collectPublicEnv(): PublicEnv {
  const missing = REQUIRED_KEYS.filter((key) => isUnusable(process.env[key]));
  if (missing.length) {
    throw new Error(
      `Missing or unexpanded environment variables for build: ${missing.join(", ")}. ` +
        `EAS builds read these from EAS environment variables (the "production" ` +
        `environment); local dev reads mobile-app/.env. A value containing "\${" means ` +
        `an eas.json env block is using \${VAR} references — EAS does not expand those.`,
    );
  }

  return {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL!.trim(),
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!.trim(),
    recaptchaSiteKey: optionalEnv(process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY),
    firebaseWebConfigJson: optionalEnv(process.env.EXPO_PUBLIC_FIREBASE_WEB_CONFIG),
    lnfUrl: optionalEnv(process.env.EXPO_PUBLIC_LNF_URL),
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
