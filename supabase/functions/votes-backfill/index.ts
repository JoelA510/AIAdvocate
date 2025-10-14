// supabase/functions/votes-backfill/index.ts
// Backfills OpenStates vote events and member votes for all cataloged bills.

import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { fetchBillVotes } from "../../../src/lib/openstatesClient.ts";
import { syncBillVoteEvents, type BillContext } from "../_shared/votes/syncVotes.ts";

type BillRow = {
  id: number;
  bill_number: string | null;
  title: string | null;
  openstates_bill_id: string;
  vote_events?: Array<{ count: number }>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PAGE_SIZE = 25;
const RATE_LIMIT_DELAY_MS = 1200;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";
  const limitParam = Number(url.searchParams.get("limit") ?? "0");
  const offsetParam = Number(url.searchParams.get("offset") ?? "0");
  const pageSizeParam = Number(url.searchParams.get("page_size") ?? "0");

  const pageSize = Number.isFinite(pageSizeParam) && pageSizeParam > 0
    ? Math.min(pageSizeParam, DEFAULT_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const initialOffset = Number.isFinite(offsetParam) && offsetParam > 0 ? Math.floor(offsetParam) : 0;
  let remaining = Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : Number.POSITIVE_INFINITY;

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

    const { count: availableCount, error: countError } = await supabaseAdmin
      .from("bills")
      .select("id", { count: "exact", head: true })
      .not("openstates_bill_id", "is", null);

    if (countError) throw countError;
    if (!availableCount) {
      log("error", "No bills with openstates_bill_id detected; aborting backfill.");
      return new Response(JSON.stringify({ error: "No bills with openstates_bill_id found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 412,
      });
    }

    let offset = initialOffset;
    let processedBills = 0;
    let totalVoteEvents = 0;
    let totalVoteRecords = 0;
    const skippedBills: Array<{ id: number; reason: string }> = [];
    const billErrors: Array<{ id: number; message: string }> = [];

    while (remaining > 0) {
      const fetchCount = Number.isFinite(remaining) ? Math.min(pageSize, remaining) : pageSize;
      const { data, error } = await supabaseAdmin
        .from("bills")
        .select("id,bill_number,title,openstates_bill_id,vote_events(count)")
        .not("openstates_bill_id", "is", null)
        .order("id", { ascending: true })
        .range(offset, offset + fetchCount - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      const bills = (data as BillRow[]).filter((bill): bill is BillRow => Boolean(bill.openstates_bill_id));
      if (Number.isFinite(remaining)) {
        remaining -= bills.length;
      }

      for (const bill of bills) {
        const billContext: BillContext = {
          id: bill.id,
          openstates_bill_id: bill.openstates_bill_id,
          bill_number: bill.bill_number,
          title: bill.title,
        };

        const existingCount = bill.vote_events?.[0]?.count ?? 0;
        if (!force && existingCount > 0) {
          skippedBills.push({ id: bill.id, reason: "Existing vote events present" });
          continue;
        }

        try {
          const bundle = await fetchBillVotes(openStatesKey, bill.openstates_bill_id);

          if (!bundle.events.length) {
            log("info", "No vote events returned for bill", {
              billId: bill.id,
              billNumber: bill.bill_number,
              openstatesId: bill.openstates_bill_id,
            });
            continue;
          }

          const { voteEventsProcessed, voteRecordsProcessed } = await syncBillVoteEvents(
            supabaseAdmin,
            billContext,
            bundle,
          );

          processedBills += 1;
          totalVoteEvents += voteEventsProcessed;
          totalVoteRecords += voteRecordsProcessed;

          log("info", "Bill processed", {
            billId: bill.id,
            billNumber: bill.bill_number,
            voteEventsProcessed,
            voteRecordsProcessed,
          });

          await sleep(RATE_LIMIT_DELAY_MS);
        } catch (err) {
          const message = err instanceof Error ? err.message : JSON.stringify(err);
          log("error", "Failed processing bill", {
            billId: bill.id,
            billNumber: bill.bill_number,
            error: message,
          });
          billErrors.push({ id: bill.id, message });
          await sleep(RATE_LIMIT_DELAY_MS);
        }
      }

      offset += bills.length;
      if (Number.isFinite(remaining) && remaining <= 0) {
        break;
      }
    }

    const summary = {
      processedBills,
      voteEventsUpserted: totalVoteEvents,
      voteRecordsUpserted: totalVoteRecords,
      skippedBills,
      errors: billErrors,
    };

    log("info", "Backfill summary", summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: billErrors.length ? 207 : 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("error", "Fatal backfill error", { error: message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

function log(
  level: "info" | "warn" | "error",
  msg: string,
  payload: Record<string, unknown> = {},
) {
  const entry = JSON.stringify({ level, context: "votes-backfill", msg, ...payload });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
