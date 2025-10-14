// supabase/functions/votes-daily/index.ts
// Nightly incremental sync for OpenStates vote events and vote records.

import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

import {
  fetchRecentVoteEvents,
  fetchVotesForBills,
} from "../../../src/lib/openstatesClient.ts";
import { syncBillVoteEvents, type BillContext } from "../_shared/votes/syncVotes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JOB_KEY = "votes-daily:last-run";
const FALLBACK_WINDOW_MS = 1000 * 60 * 60 * 48; // 48 hours

type BillRow = {
  id: number;
  bill_number?: string | null;
  title?: string | null;
  openstates_bill_id: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const openStatesKey = Deno.env.get("OPENSTATES_API_KEY");

    if (!supabaseUrl || !serviceRoleKey || !openStatesKey) {
      const missing = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENSTATES_API_KEY"].filter((key) =>
        !Deno.env.get(key)
      );
      log("error", "Missing required environment variables", { missing });
      return new Response(JSON.stringify({ error: "Missing required environment variables" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const sinceIso = await resolveSinceIso(req.url, supabaseAdmin);
    log("info", "Fetching updates", { sinceIso });

    const events = await fetchRecentVoteEvents(openStatesKey, sinceIso);
    if (!events.length) {
      log("info", "No recent vote events detected");
      await upsertJobState(supabaseAdmin, new Date().toISOString());
      return new Response(
        JSON.stringify({ message: "No new vote events", since: sinceIso, processedBills: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const billIds = new Set<string>();
    const eventsWithoutBill: string[] = [];
    for (const event of events) {
      const billId = event.bill?.id;
      if (!billId) {
        eventsWithoutBill.push(event.id);
        continue;
      }
      billIds.add(billId);
    }

    log("info", "Recent vote events fetched", {
      events: events.length,
      candidateBills: billIds.size,
      eventsWithoutBill,
    });

    if (billIds.size === 0) {
      await upsertJobState(supabaseAdmin, new Date().toISOString());
      return new Response(
        JSON.stringify({
          message: "Events lacked bill metadata",
          since: sinceIso,
          processedBills: 0,
          eventsWithoutBill,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 207 },
      );
    }

    const billIdList = Array.from(billIds);
    const { data: billRows, error: billsError } = await supabaseAdmin
      .from("bills")
      .select("id,bill_number,title,openstates_bill_id")
      .in("openstates_bill_id", billIdList);

    if (billsError) throw billsError;

    const billMap = new Map<string, BillContext>();
    for (const row of billRows ?? []) {
      if (!row?.openstates_bill_id) continue;
      billMap.set(row.openstates_bill_id, {
        id: row.id,
        openstates_bill_id: row.openstates_bill_id,
        bill_number: row.bill_number ?? null,
        title: row.title ?? null,
      });
    }

    const bundles = await fetchVotesForBills(openStatesKey, billIdList, { sinceIso, batchSize: 3 });

    let processedBills = 0;
    let totalVoteEvents = 0;
    let totalVoteRecords = 0;
    const skippedBills: Array<{ provider_bill_id: string; reason: string }> = [];

    for (const billId of billIdList) {
      const billContext = billMap.get(billId);
      if (!billContext) {
        skippedBills.push({ provider_bill_id: billId, reason: "No matching bill in Supabase" });
        continue;
      }

      const bundle = bundles.get(billId);
      if (!bundle || !bundle.events.length) {
        skippedBills.push({ provider_bill_id: billId, reason: "No vote events returned" });
        continue;
      }

      try {
        const { voteEventsProcessed, voteRecordsProcessed } = await syncBillVoteEvents(
          supabaseAdmin,
          billContext,
          bundle,
        );

        processedBills += 1;
        totalVoteEvents += voteEventsProcessed;
        totalVoteRecords += voteRecordsProcessed;

        log("info", "Bill processed", {
          billId: billContext.id,
          billNumber: billContext.bill_number,
          voteEventsProcessed,
          voteRecordsProcessed,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log("error", "Failed syncing bill", {
          billId: billContext.id,
          billNumber: billContext.bill_number,
          error: message,
        });
        skippedBills.push({
          provider_bill_id: billId,
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
      eventsWithoutBill,
    };

    log("info", "Daily sync summary", summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: skippedBills.length ? 207 : 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("error", "Fatal daily sync error", { error: message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function resolveSinceIso(requestUrl: string, supabase: SupabaseClient<any, "public", any>): Promise<string> {
  const url = new URL(requestUrl);
  const overrideSince = url.searchParams.get("since");

  if (overrideSince) {
    const overrideDate = new Date(overrideSince);
    if (Number.isNaN(overrideDate.getTime())) {
      throw new Error(`Invalid since parameter: ${overrideSince}`);
    }
    return overrideDate.toISOString();
  }

  const { data: stateRow, error: stateError } = await supabase
    .from("job_state")
    .select("last_run")
    .eq("key", JOB_KEY)
    .maybeSingle();
  if (stateError) throw stateError;

  if (stateRow?.last_run) {
    const lastRunDate = new Date(stateRow.last_run);
    return Number.isNaN(lastRunDate.getTime())
      ? new Date(Date.now() - FALLBACK_WINDOW_MS).toISOString()
      : lastRunDate.toISOString();
  }

  return new Date(Date.now() - FALLBACK_WINDOW_MS).toISOString();
}

async function upsertJobState(
  supabase: SupabaseClient<any, "public", any>,
  lastRunIso: string,
) {
  const { error } = await supabase
    .from("job_state")
    .upsert({ key: JOB_KEY, last_run: lastRunIso }, { onConflict: "key" });
  if (error) {
    log("error", "Failed updating job_state", { error: error.message });
  }
}

function log(
  level: "info" | "warn" | "error",
  msg: string,
  payload: Record<string, unknown> = {},
) {
  const entry = JSON.stringify({ level, context: "votes-daily", msg, ...payload });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}
