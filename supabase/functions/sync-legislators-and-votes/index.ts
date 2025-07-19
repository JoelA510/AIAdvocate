import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";

// TODO: Replace with your actual LegiScan API key
const LEGISCAN_API_KEY = Deno.env.get("LEGISCAN_API_KEY")!;

serve(async (req) => {
  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 1. Fetch all legislators from the LegiScan API
    const response = await fetch(`https://api.legiscan.com/?key=${LEGISCAN_API_KEY}&op=getLegislators&state=CA`);
    const data = await response.json();

    if (data.status === "ERROR") {
      throw new Error(data.statusMessage);
    }

    const legislators = data.legislators;

    // 2. Upsert legislators into the database
    const { data: savedLegislators, error: dbError } = await supabaseAdmin
      .from("legislators")
      .upsert(
        legislators.map((legislator: any) => ({
          id: legislator.people_id,
          name: legislator.name,
          chamber: legislator.chamber,
          district: legislator.district,
          party: legislator.party,
          photo_url: legislator.photo_url,
          email: legislator.email,
        })),
        { onConflict: "id" }
      );

    if (dbError) throw dbError;

    return new Response(JSON.stringify(savedLegislators), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
