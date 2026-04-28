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

type CursorState = {
  next_offset: number;
  completed_at: string | null;
  updated_at: string;
  total_available: number | null;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_PAGE_SIZE = 25;
const DEFAULT_LIMIT_PER_RUN = 30;
const MAX_LIMIT_PER_RUN = 100;
const RATE_LIMIT_DELAY_MS = 1200;
const CURSOR_KEY = "votes_backfill:openstates:ca";
const DEFAULT_MAX_RUNTIME_MS = 18_000;
const HARD_MAX_RUNTIME_MS = 26_000;
const DEADLINE_GUARD_MS = 1_000;
const PREVIEW_LIMIT = 10;

const parsePositiveInt = (value: string | null, fallback: number, max: number): number => {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(Math.floor(parsed), max));
};

const getMaxRuntimeMs = (): number =>
  parsePositiveInt(Deno.env.get("VOTES_BACKFILL_MAX_RUNTIME_MS") ?? null, DEFAULT_MAX_RUNTIME_MS, HARD_MAX_RUNTIME_MS);

const getDefaultLimitPerRun = (): number =>
  parsePositiveInt(
    Deno.env.get("VOTES_BACKFILL_MAX_BILLS_PER_RUN") ?? null,
    DEFAULT_LIMIT_PER_RUN,
    MAX_LIMIT_PER_RUN,
  );

async function getCursor(supabaseAdmin: ReturnType<typeof createClient>): Promise<CursorState | null> {
  const { data, error } = await supabaseAdmin
    .from("ingestion_cursors")
    .select("cursor")
    .eq("key", CURSOR_KEY)
    .maybeSingle();

  if (error) throw error;
  return (data?.cursor as CursorState | null) ?? null;
}

async function setCursor(supabaseAdmin: ReturnType<typeof createClient>, cursor: CursorState): Promise<void> {
  const { error } = await supabaseAdmin
    .from("ingestion_cursors")
    .upsert({ key: CURSOR_KEY, cursor, updated_at: cursor.updated_at }, { onConflict: "key" });

  if (error) throw error;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  const pageSizeRaw = url.searchParams.get("page_size");

  const pageSize = parsePositiveInt(pageSizeRaw, DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const explicitLimit = limitRaw ? parsePositiveInt(limitRaw, getDefaultLimitPerRun(), MAX_LIMIT_PER_RUN) : null;
  const runLimit = explicitLimit ?? getDefaultLimitPerRun();
  const explicitOffset = offsetRaw ? parsePositiveInt(offsetRaw, 0, Number.MAX_SAFE_INTEGER) : null;
  const startedAt = Date.now();
  const stopAt = startedAt + getMaxRuntimeMs();
  let remaining = runLimit;

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

    const cursorState = force ? null : await getCursor(supabaseAdmin);
    let offset = explicitOffset ?? Math.max(0, cursorState?.next_offset ?? 0);
    let processedBills = 0;
    let totalVoteEvents = 0;
    let totalVoteRecords = 0;
    let skippedBillsCount = 0;
    const skippedBillsPreview: Array<{ id: number; reason: string }> = [];
    let errorsCount = 0;
    const errorsPreview: Array<{ id: number; message: string }> = [];
    const startOffset = offset;
    let hasMore = offset < availableCount;

    while (remaining > 0 && Date.now() < stopAt - DEADLINE_GUARD_MS) {
      const fetchCount = Math.min(pageSize, remaining);
      const { data, error } = await supabaseAdmin
        .from("bills")
        .select("id,bill_number,title,openstates_bill_id,vote_events(count)")
        .not("openstates_bill_id", "is", null)
        .order("id", { ascending: true })
        .range(offset, offset + fetchCount - 1);

      if (error) throw error;
      if (!data || data.length === 0) {
        hasMore = false;
        break;
      }

      const bills = (data as BillRow[]).filter((bill): bill is BillRow => Boolean(bill.openstates_bill_id));
      remaining -= bills.length;

      for (const bill of bills) {
        const billContext: BillContext = {
          id: bill.id,
          openstates_bill_id: bill.openstates_bill_id,
          bill_number: bill.bill_number,
          title: bill.title,
        };

        const existingCount = bill.vote_events?.[0]?.count ?? 0;
        if (!force && existingCount > 0) {
          skippedBillsCount += 1;
          if (skippedBillsPreview.length < PREVIEW_LIMIT) {
            skippedBillsPreview.push({ id: bill.id, reason: "Existing vote events present" });
          }
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
          errorsCount += 1;
          if (errorsPreview.length < PREVIEW_LIMIT) {
            errorsPreview.push({ id: bill.id, message });
          }
          await sleep(RATE_LIMIT_DELAY_MS);
        }
      }

      offset += bills.length;
      hasMore = offset < availableCount;
      if (remaining <= 0) {
        break;
      }
    }

    const nowIso = new Date().toISOString();
    const cursor: CursorState = {
      next_offset: offset,
      completed_at: hasMore ? null : nowIso,
      updated_at: nowIso,
      total_available: availableCount ?? null,
    };
    await setCursor(supabaseAdmin, cursor);

    const summary = {
      message: hasMore
        ? "Processed bounded votes backfill batch. Invoke again to continue."
        : "Votes backfill batch completed for current offset window.",
      cursor_key: CURSOR_KEY,
      runtime_ms: Date.now() - startedAt,
      forced: force,
      page_size: pageSize,
      requested_limit: runLimit,
      processedBills,
      voteEventsUpserted: totalVoteEvents,
      voteRecordsUpserted: totalVoteRecords,
      skippedBillsCount,
      skippedBillsPreview,
      errorsCount,
      errorsPreview,
      continuation: {
        has_more: hasMore,
        next_offset: offset,
      },
      processed_window: {
        start_offset: startOffset,
        end_offset_exclusive: offset,
        available_count: availableCount,
      },
    };

    log("info", "Backfill summary", summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: errorsCount ? 207 : 200,
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
