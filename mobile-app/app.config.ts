import { ExpoConfig, ConfigContext } from "expo/config";
import path from "path";
import dotenvFlow from "dotenv-flow";
import appJson from "./app.json";

// Load environment variables from .env files before Expo evaluates the config.
dotenvFlow.config({ path: path.resolve(__dirname), default_node_env: "development" });

type PublicEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  openstatesApiKey: string;
  locationIqApiKey: string;
  recaptchaSiteKey?: string;
  firebaseWebConfigJson?: string;
  lnfUrl?: string;
};

const REQUIRED_KEYS = [
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
  "EXPO_PUBLIC_OPENSTATES_API_KEY",
  "EXPO_PUBLIC_LOCATIONIQ_API_KEY",
] as const;

function collectPublicEnv(): PublicEnv {
  const missing = REQUIRED_KEYS.filter((key) => !process.env[key] || process.env[key]?.trim() === "");
  if (missing.length) {
    throw new Error(
      `Missing environment variables for build: ${missing.join(", ")}. ` +
        `Populate them in mobile-app/.env or your CI environment before building.`,
    );
  }

  return {
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL!.trim(),
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!.trim(),
    openstatesApiKey: process.env.EXPO_PUBLIC_OPENSTATES_API_KEY!.trim(),
    locationIqApiKey: process.env.EXPO_PUBLIC_LOCATIONIQ_API_KEY!.trim(),
    recaptchaSiteKey: process.env.EXPO_PUBLIC_RECAPTCHA_SITE_KEY?.trim(),
    firebaseWebConfigJson: process.env.EXPO_PUBLIC_FIREBASE_WEB_CONFIG?.trim(),
    lnfUrl: process.env.EXPO_PUBLIC_LNF_URL?.trim(),
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
