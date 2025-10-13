import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";

import { getConfig } from "./config";

const { supabaseUrl, supabaseAnonKey } = getConfig();

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
