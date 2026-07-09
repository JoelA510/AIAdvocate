import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

import { corsHeaders } from "../_shared/cors.ts";

// Retired: this endpoint ran with verify_jwt=false and no in-code auth check,
// looping the entire `bills` table and fanning out concurrent service-role
// writes (via summarize-simple) to anyone who could POST to it -- an open,
// expensive, unauthenticated trigger for mass bill-summary regeneration.
// Nothing in the client, migrations, or ops scripts invokes it (confirmed by
// repo search), so it and summarize-simple's only caller are both dead.
// Retired to a fail-closed stub rather than left live.
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ error: "Retired." }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
