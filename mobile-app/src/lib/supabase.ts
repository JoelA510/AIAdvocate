import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";

import { getConfig } from "./config";

// This module is evaluated during initial graph evaluation (imported via
// _layout → AuthProvider), so a getConfig() throw here would kill the bundle
// before React mounts — the v1.6–1.7 eternal-splash incident. Fall back to an
// inert sentinel client instead: _layout's initConfig() re-throws the real
// error inside a try/catch and renders the Configuration Error screen.
function resolveClientConfig(): { supabaseUrl: string; supabaseAnonKey: string } {
  try {
    return getConfig();
  } catch (error) {
    console.error("Supabase config unavailable; starting with an inert client.", error);
    return { supabaseUrl: "https://invalid.localhost", supabaseAnonKey: "invalid" };
  }
}

const { supabaseUrl, supabaseAnonKey } = resolveClientConfig();

// Create a Supabase client without a custom storage option.
// On the web, it will default to using localStorage, which is
// what we want. This is safe for both client and server environments.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
