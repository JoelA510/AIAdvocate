// supabase/functions/votes-daily/index.ts
// Nightly incremental sync for OpenStates vote events and vote records.

import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

import { fetchRecentVoteEvents } from "./openstates.ts";
import type { OpenStatesVoteEvent } from "./openstates.ts";
import { syncBillVoteEvents } from "../_shared/votes/syncVotes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JOB_KEY = "votes-daily:last-run";
const FALLBACK_WINDOW_MS = 1000 * 60 * 60 * 48; // 48 hours
const MAX_RETRIES = 3;

type BillRow = {
  id: number;
  bill_number?: string | null;
  title?: string | null;
  openstates_bill_id?: string | null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

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

    const url = new URL(req.url);
    const overrideSince = url.searchParams.get("since");

    let sinceIso: string;
    if (overrideSince) {
      const overrideDate = new Date(overrideSince);
      if (Number.isNaN(overrideDate.getTime())) {
        throw new Error(`Invalid since parameter: ${overrideSince}`);
      }
      sinceIso = overrideDate.toISOString();
    } else {
      const { data: stateRow, error: stateError } = await supabaseAdmin
        .from("job_state")
        .select("last_run")
        .eq("key", JOB_KEY)
        .maybeSingle();
      if (stateError) throw stateError;

      if (stateRow?.last_run) {
        const lastRunDate = new Date(stateRow.last_run);
        sinceIso = Number.isNaN(lastRunDate.getTime())
          ? new Date(Date.now() - FALLBACK_WINDOW_MS).toISOString()
          : lastRunDate.toISOString();
      } else {
        sinceIso = new Date(Date.now() - FALLBACK_WINDOW_MS).toISOString();
      }
    }

    console.log(`[votes-daily] Fetching events since ${sinceIso}`);

    const events = await withRetry(() => fetchRecentVoteEvents(openStatesKey, sinceIso), MAX_RETRIES);

    if (!events.length) {
      console.log("[votes-daily] No recent vote events detected.");
      await upsertJobState(supabaseAdmin, new Date().toISOString());
      return new Response(
        JSON.stringify({ message: "No new vote events", since: sinceIso, processedBills: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const grouped = new Map<string, OpenStatesVoteEvent[]>();
    const missingBillMetadata: string[] = [];

    for (const event of events) {
      const billId = event.bill?.id;
      if (!billId) {
        missingBillMetadata.push(event.id);
        continue;
      }
      if (!grouped.has(billId)) grouped.set(billId, []);
      grouped.get(billId)!.push(event);
    }

    const providerBillIds = Array.from(grouped.keys());
    console.log(`[votes-daily] Received ${events.length} events across ${providerBillIds.length} bills.`);

    const { data: billRows, error: billsError } = await supabaseAdmin
      .from("bills")
      .select("id,bill_number,title,openstates_bill_id")
      .in("openstates_bill_id", providerBillIds);

    if (billsError) throw billsError;

    const billMap = new Map<string, BillRow>();
    for (const row of billRows ?? []) {
      if (row?.openstates_bill_id) {
        billMap.set(row.openstates_bill_id, row as BillRow);
      }
    }

    let processedBills = 0;
    let totalVoteEvents = 0;
    let totalVoteRecords = 0;
    const skippedBills: Array<{ provider_bill_id: string; reason: string }> = [];

    for (const [providerBillId, billEvents] of grouped.entries()) {
      const bill = billMap.get(providerBillId);
      if (!bill) {
        skippedBills.push({
          provider_bill_id: providerBillId,
          reason: "No matching bill in Supabase",
        });
        continue;
      }

      try {
        const { voteEventsProcessed, voteRecordsProcessed } = await syncBillVoteEvents(
          supabaseAdmin,
          bill,
          billEvents,
        );

        processedBills += 1;
        totalVoteEvents += voteEventsProcessed;
        totalVoteRecords += voteRecordsProcessed;

        console.log(
          `[votes-daily] Bill ${bill.bill_number ?? bill.id} processed (${voteEventsProcessed} events, ${voteRecordsProcessed} records).`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[votes-daily] Failed syncing bill ${bill.bill_number ?? bill.id}: ${message}`);
        skippedBills.push({
          provider_bill_id: providerBillId,
          reason: `Sync error: ${message}`,
        });
      }
    }

    await upsertJobState(supabaseAdmin, new Date().toISOString());

    const summary = {
      since: sinceIso,
      processedBills,
      voteEventsUpserted: totalVoteEvents,
      voteRecordsUpserted: totalVoteRecords,
      skippedBills,
      eventsWithoutBill: missingBillMetadata,
    };

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: skippedBills.length ? 207 : 200,
    });
  } catch (error) {
    console.error("[votes-daily] Fatal error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function upsertJobState(
  supabase: SupabaseClient<any, "public", any>,
  lastRunIso: string,
) {
  const { error } = await supabase
    .from("job_state")
    .upsert({ key: JOB_KEY, last_run: lastRunIso }, { onConflict: "key" });
  if (error) {
    console.error("[votes-daily] Failed updating job_state", error);
  }
}

async function withRetry<T>(fn: () => Promise<T>, attempts: number): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const delay = 500 * Math.pow(2, attempt);
      console.warn(`[votes-daily] Attempt ${attempt + 1} failed:`, error);
      await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
