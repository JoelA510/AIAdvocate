// supabase/functions/votes-backfill/index.ts
// Backfills OpenStates vote events + member votes for all bills in the catalog.

import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { fetchBillVoteEvents } from "./openstates.ts";
import { syncBillVoteEvents } from "../_shared/votes/syncVotes.ts";

type BillRow = {
  id: number;
  bill_number: string | null;
  title: string | null;
  openstates_bill_id: string | null;
  vote_events?: Array<{ count: number }>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PAGE_SIZE = 50;
const MAX_RETRIES = 3;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openStatesKey = Deno.env.get("OPENSTATES_API_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase service credentials.");
    }
    if (!openStatesKey) {
      throw new Error("Missing OPENSTATES_API_KEY.");
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    let offset = 0;
    let processedBills = 0;
    let totalVoteEvents = 0;
    let totalVoteRecords = 0;
    const skippedBills: Array<{ id: number; reason: string }> = [];
    const billErrors: Array<{ id: number; message: string }> = [];

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("bills")
        .select("id,bill_number,title,openstates_bill_id,vote_events(count)")
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      const bills = data as BillRow[];

      for (const bill of bills) {
        const existingCount = bill.vote_events?.[0]?.count ?? 0;
        if (!force && existingCount > 0) continue;

        if (!bill.openstates_bill_id) {
          skippedBills.push({
            id: bill.id,
            reason: "Missing openstates_bill_id",
          });
          continue;
        }

        try {
          const events = await withRetry(() => fetchBillVoteEvents(openStatesKey, bill.openstates_bill_id!), MAX_RETRIES);

          if (!events.length) {
            console.log(
              `[votes-backfill] No vote events returned for bill ${bill.bill_number ?? bill.id} (${bill.openstates_bill_id}).`,
            );
            continue;
          }

          const { voteEventsProcessed, voteRecordsProcessed } = await syncBillVoteEvents(
            supabaseAdmin,
            bill,
            events,
          );

          processedBills += 1;
          totalVoteEvents += voteEventsProcessed;
          totalVoteRecords += voteRecordsProcessed;

          console.log(
            `[votes-backfill] Bill ${bill.bill_number ?? bill.id}: ${voteEventsProcessed} events, ${voteRecordsProcessed} records.`,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[votes-backfill] Failed for bill ${bill.id}: ${message}`);
          billErrors.push({ id: bill.id, message });
        }
      }

      offset += PAGE_SIZE;
    }

    const summary = {
      processedBills,
      voteEventsUpserted: totalVoteEvents,
      voteRecordsUpserted: totalVoteRecords,
      skippedBills,
      errors: billErrors,
    };

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: billErrors.length ? 207 : 200,
    });
  } catch (error) {
    console.error("[votes-backfill] Fatal error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const delay = 500 * Math.pow(2, attempt);
      console.warn(`[votes-backfill] Attempt ${attempt + 1} failed:`, error);
      await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
