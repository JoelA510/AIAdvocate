// supabase/functions/sync-legislators-and-votes/index.ts

import { serve } from "std/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const LEGISCAN_API_KEY = Deno.env.get("LEGISCAN_API_KEY")!;

serve(async (req) => {
  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 1. Fetch all legislators from the LegiScan API for a specific state (e.g., CA)
    const legislatorsResponse = await fetch(`https://api.legiscan.com/?key=${LEGISCAN_API_KEY}&op=getLegislators&state=CA`);
    const legislatorsData = await legislatorsResponse.json();

    if (legislatorsData.status === "ERROR") {
      throw new Error(legislatorsData.statusMessage);
    }

    const legislators = legislatorsData.legislators;

    // 2. Upsert legislators into the database
    const { data: savedLegislators, error: legislatorError } = await supabaseAdmin
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

    if (legislatorError) throw legislatorError;

    // 3. Fetch votes for each bill
    const { data: bills } = await supabaseAdmin.from("bills").select("id");
    if (!bills) throw new Error("No bills found");

    for (const bill of bills) {
      const votesResponse = await fetch(`https://api.legiscan.com/?key=${LEGISCAN_API_KEY}&op=getBillVotes&id=${bill.id}`);
      const votesData = await votesResponse.json();

      if (votesData.status === "ERROR") {
        console.error(`Could not fetch votes for bill ${bill.id}: ${votesData.statusMessage}`);
        continue;
      }

      const votes = votesData.votes;

      // 4. Upsert votes into the database
      const { error: voteError } = await supabaseAdmin
        .from("votes")
        .upsert(
          votes.map((vote: any) => ({
            bill_id: bill.id,
            legislator_id: vote.people_id,
            vote_option: vote.vote,
          })),
          { onConflict: "bill_id,legislator_id" }
        );

      if (voteError) console.error(`Error saving votes for bill ${bill.id}:`, voteError);
    }

    return new Response(JSON.stringify({ message: "Sync complete" }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});