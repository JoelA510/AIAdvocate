// supabase/functions/sync-legislators-and-votes/index.ts

import { serve } from "std/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const LEGISCAN_API_KEY = Deno.env.get("LEGISCAN_API_KEY")!;

serve(async (req) => {
  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const normalize = (value?: string | number | null) => {
      if (value === null || value === undefined) return "";
      return String(value).toLowerCase().replace(/[^a-z0-9]/g, "");
    };

    const normalizeChamber = (value?: string | null) => {
      const lowered = (value ?? "").toLowerCase();
      if (!lowered) return "";
      if (lowered.includes("upper") || lowered.includes("senate")) return "upper";
      if (lowered.includes("lower") || lowered.includes("house") || lowered.includes("assembly")) {
        return "lower";
      }
      return lowered.replace(/[^a-z0-9]/g, "");
    };

    const buildLookupKey = (name?: string, chamber?: string, district?: string | number) =>
      `${normalize(name)}::${normalizeChamber(chamber)}::${normalize(district)}`;

    const chunk = <T>(items: T[], size: number) => {
      const batches: T[][] = [];
      for (let i = 0; i < items.length; i += size) {
        batches.push(items.slice(i, i + size));
      }
      return batches;
    };

    // 1. Fetch all legislators from the LegiScan API for a specific state (e.g., CA)
    const legislatorsResponse = await fetch(`https://api.legiscan.com/?key=${LEGISCAN_API_KEY}&op=getLegislators&state=CA`);
    const legislatorsData = await legislatorsResponse.json();

    if (legislatorsData.status === "ERROR") {
      throw new Error(legislatorsData.statusMessage);
    }

    const legislators = legislatorsData.legislators;

    // 2. Upsert legislators into the database
    const formattedLegislators = legislators
      .map((legislator: any) => {
        const id = Number(legislator.people_id);
        if (!id) return null;
        return {
          id,
          name: legislator.name,
          chamber: legislator.chamber,
          district: legislator.district,
          party: legislator.party,
          photo_url: legislator.photo_url,
          email: legislator.email,
          lookup_key: buildLookupKey(legislator.name, legislator.chamber, legislator.district),
        };
      })
      .filter(Boolean);

    const { error: legislatorError } = await supabaseAdmin
      .from("legislators")
      .upsert(formattedLegislators, { onConflict: "id" });

    if (legislatorError) throw legislatorError;

    // 3. Fetch votes for each bill
    const { data: bills } = await supabaseAdmin.from("bills").select("id");
    if (!bills) throw new Error("No bills found");

    for (const bill of bills) {
      const votesResponse = await fetch(`https://api.legiscan.com/?key=${LEGISCAN_API_KEY}&op=getBillVotes&id=${bill.id}`);
      if (!votesResponse.ok) {
        console.error(`Could not fetch votes for bill ${bill.id}: ${votesResponse.status}`);
        continue;
      }
      const votesData = await votesResponse.json();

      if (votesData.status === "ERROR") {
        console.error(`Could not fetch votes for bill ${bill.id}: ${votesData.statusMessage}`);
        continue;
      }

      const billDetailsResponse = await fetch(
        `https://api.legiscan.com/?key=${LEGISCAN_API_KEY}&op=getBill&id=${bill.id}`,
      );
      if (billDetailsResponse.ok) {
        const billDetailsJson = await billDetailsResponse.json();
        const billInfo = billDetailsJson?.bill;
        if (billDetailsJson.status !== "ERROR" && billInfo) {
          const { error: billUpdateError } = await supabaseAdmin
            .from("bills")
            .update({
              title: billInfo.title ?? null,
              description: billInfo.description ?? null,
              status: billInfo.status ? String(billInfo.status) : null,
              status_text: billInfo.status_text ?? null,
              status_date: billInfo.status_date ?? null,
              state_link: billInfo.state_link ?? null,
              change_hash: billInfo.change_hash ?? null,
              progress: Array.isArray(billInfo.progress) ? billInfo.progress : [],
              calendar: Array.isArray(billInfo.calendar) ? billInfo.calendar : [],
              history: Array.isArray(billInfo.history) ? billInfo.history : [],
            })
            .eq("id", billInfo.bill_id ?? bill.id);
          if (billUpdateError) {
            console.error(`Failed updating bill ${bill.id} metadata:`, billUpdateError);
          }
        }
      }

      const votes = Array.isArray(votesData.votes) ? votesData.votes : [];

      if (!votes.length) {
        await supabaseAdmin.from("votes").delete().eq("bill_id", bill.id);
        continue;
      }

      const rollCallRows: any[] = [];

      for (const vote of votes) {
        const voteId = Number(vote.vote_id);
        if (!voteId) continue;

        const yes = Number(vote.yea ?? vote.yes ?? 0) || 0;
        const no = Number(vote.nay ?? vote.no ?? 0) || 0;
        const other =
          Number(vote.nv ?? 0) +
          Number(vote.absent ?? 0) +
          Number(vote.excused ?? 0) +
          Number(vote.present ?? 0);
        const motion = vote.motion ?? vote.vote_name ?? null;
        const result = vote.result ?? null;
        const date = vote.date ?? vote.date_taken ?? null;
        const rollCalls = Array.isArray(vote.roll_call) ? vote.roll_call : [];

        for (const entry of rollCalls) {
          const legislatorId = Number(entry.people_id);
          if (!legislatorId) continue;
          rollCallRows.push({
            vote_id: voteId,
            bill_id: bill.id,
            legislator_id: legislatorId,
            option: entry.vote ?? null,
            result,
            yes_count: yes,
            no_count: no,
            other_count: other,
            date,
            motion,
          });
        }
      }

      const { error: deleteError } = await supabaseAdmin.from("votes").delete().eq("bill_id", bill.id);
      if (deleteError) {
        console.error(`Error clearing existing votes for bill ${bill.id}:`, deleteError);
      }

      for (const batch of chunk(rollCallRows, 500)) {
        if (!batch.length) continue;
        const { error: voteError } = await supabaseAdmin
          .from("votes")
          .upsert(batch, { onConflict: "vote_id,legislator_id" });
        if (voteError) {
          console.error(`Error saving votes for bill ${bill.id}:`, voteError);
        }
      }
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
