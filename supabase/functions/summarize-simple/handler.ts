import { corsHeaders } from "../_shared/cors.ts";

// Retired to a fail-closed stub. Nothing in the client, migrations, cron
// schedules, ops scripts or other Edge Functions invokes this endpoint
// (confirmed by repo search); its only caller was summarize-simple-backfill,
// itself retired. Bill summaries are produced by sync-updated-bills.
// The directory stays so that the stub deploys over the old function.
export const handler = (req: Request): Response => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ error: "Retired." }),
    {
      status: 410,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
};
