import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

import { corsHeaders } from "../_shared/cors.ts";

// Retired: this endpoint previously bypassed all verification and always
// returned success ("INSECURE DEBUG MODE"). No client code calls it (a repo
// search found zero references to verify-app-check outside a stale
// generated dump), and @react-native-firebase/app-check is not wired up
// anywhere in the client either. Real Firebase App Check server-side
// verification requires Firebase Admin credentials this project has not
// provisioned; until that is built as a deliberate feature, fail closed
// rather than lie about verification.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ error: "Not implemented. App Check verification is not active." }),
    { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
