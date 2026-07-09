import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

import { corsHeaders } from "../_shared/cors.ts";

// Retired: this was a mock-mode sandbox endpoint ("--- MOCK MODE ENABLED ---")
// that upserted hardcoded MOCK_BILL_DATA into the production `bills` table
// using the service-role key, with no auth check (verify_jwt=false and no
// in-code authorization). Nothing in the client, migrations, or ops scripts
// invokes it. Left deployed, it was a live, unauthenticated write path that
// could inject fake bill data into production. Retired to a fail-closed stub
// rather than left live; real ingestion runs through sync-updated-bills /
// bulk-import-dataset.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ error: "Retired. Use sync-updated-bills or bulk-import-dataset." }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
