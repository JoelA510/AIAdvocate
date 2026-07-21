import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

import { getConfig } from "./config";

// See supabase.ts: a module-scope getConfig() throw here kills the bundle
// before React mounts (the v1.6–1.7 incident). The sentinel client keeps the
// graph alive so _layout's Configuration Error screen can actually render.
function resolveClientConfig(): { supabaseUrl: string; supabaseAnonKey: string } {
  try {
    return getConfig();
  } catch (error) {
    console.error("Supabase config unavailable; starting with an inert client.", error);
    return { supabaseUrl: "https://invalid.localhost", supabaseAnonKey: "invalid" };
  }
}

const { supabaseUrl, supabaseAnonKey } = resolveClientConfig();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
