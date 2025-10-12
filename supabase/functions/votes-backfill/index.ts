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

const DEFAULT_PAGE_SIZE = 25;
const RATE_LIMIT_DELAY_MS = 1200;
const MAX_RETRIES = 5;

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

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Missing Supabase service credentials.");
    }
    if (!openStatesKey) {
      throw new Error("Missing OPENSTATES_API_KEY.");
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

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
        .order("id", { ascending: true })
        .range(offset, offset + fetchCount - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      const bills = data as BillRow[];
      if (Number.isFinite(remaining)) {
        remaining -= bills.length;
      }

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

          await sleep(RATE_LIMIT_DELAY_MS);
        } catch (err) {
          const message = err instanceof Error ? err.message : JSON.stringify(err);
          console.error(`[votes-backfill] Failed for bill ${bill.id}: ${message}`);
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
      const message = error instanceof Error ? error.message : String(error);
      const isRateLimited = message.includes("429") || message.toLowerCase().includes("rate limit");
      const baseDelay = isRateLimited ? 1500 : 500;
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`[votes-backfill] Attempt ${attempt + 1} failed: ${message}. Retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
