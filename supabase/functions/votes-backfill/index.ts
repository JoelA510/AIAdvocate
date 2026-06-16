// supabase/functions/votes-backfill/index.ts
// Backfills OpenStates vote events and member votes for all cataloged bills.

import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { fetchBillVotes } from "../../../src/lib/openstatesClient.ts";
import { syncBillVoteEvents, type BillContext } from "../_shared/votes/syncVotes.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveServiceKey } from "../_shared/utils.ts";
import { isAuthorizedCronOrAdmin } from "../_shared/auth.ts";

type BillRow = {
  id: number;
  bill_number: string | null;
  title: string | null;
  openstates_bill_id: string;
  vote_events?: Array<{ count: number }>;
};

type CursorState = {
  last_bill_id: number | null;
  last_failed_bill_id: number | null;
  next_offset?: number | null; // legacy support for older cursor shape
  completed_at: string | null;
  updated_at: string;
  total_available: number | null;
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

const parseNonNegativeInt = (value: string | null): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.floor(parsed);
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

async function resolveLegacyOffsetResumeId(
  supabaseAdmin: ReturnType<typeof createClient>,
  legacyOffset: number,
): Promise<number> {
  if (!Number.isFinite(legacyOffset) || legacyOffset <= 0) return 0;

  const { data, error } = await supabaseAdmin
    .from("bills")
    .select("id")
    .not("openstates_bill_id", "is", null)
    .order("id", { ascending: true })
    .range(legacyOffset - 1, legacyOffset - 1)
    .maybeSingle();

  if (error) throw error;
  return typeof data?.id === "number" ? data.id : 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!(await isAuthorizedCronOrAdmin(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";
  const limitRaw = url.searchParams.get("limit");
  const offsetRaw = url.searchParams.get("offset");
  const startBillIdRaw = url.searchParams.get("start_bill_id");
  const pageSizeRaw = url.searchParams.get("page_size");

  const pageSize = parsePositiveInt(pageSizeRaw, DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const explicitLimit = limitRaw ? parsePositiveInt(limitRaw, getDefaultLimitPerRun(), MAX_LIMIT_PER_RUN) : null;
  const runLimit = explicitLimit ?? getDefaultLimitPerRun();
  const explicitOffset = parseNonNegativeInt(offsetRaw);
  const explicitStartBillId = parseNonNegativeInt(startBillIdRaw);
  const startedAt = Date.now();
  const stopAt = startedAt + getMaxRuntimeMs();
  let remaining = runLimit;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = resolveServiceKey();
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
    const legacyOffset = cursorState?.next_offset ?? null;
    const offsetResumeId = explicitOffset !== null
      ? await resolveLegacyOffsetResumeId(supabaseAdmin, explicitOffset)
      : null;
    const legacyResumeId = (explicitStartBillId === null && explicitOffset === null && !force && legacyOffset !== null)
      ? await resolveLegacyOffsetResumeId(supabaseAdmin, legacyOffset)
      : null;
    const startAfterBillId = explicitStartBillId ??
      offsetResumeId ??
      Math.max(0, cursorState?.last_bill_id ?? legacyResumeId ?? 0);
    let lastSuccessfulBillId = startAfterBillId;
    let processedBills = 0;
    let totalVoteEvents = 0;
    let totalVoteRecords = 0;
    let skippedBillsCount = 0;
    const skippedBillsPreview: Array<{ id: number; reason: string }> = [];
    let errorsCount = 0;
    const errorsPreview: Array<{ id: number; message: string }> = [];
    let sourceExhausted = false;
    let failedBillId: number | null = null;

    while (remaining > 0 && Date.now() < stopAt - DEADLINE_GUARD_MS) {
      const fetchCount = Math.min(pageSize, remaining);
      const { data, error } = await supabaseAdmin
        .from("bills")
        .select("id,bill_number,title,openstates_bill_id,vote_events(count)")
        .not("openstates_bill_id", "is", null)
        .gt("id", lastSuccessfulBillId)
        .order("id", { ascending: true })
        .limit(fetchCount);

      if (error) throw error;
      if (!data || data.length === 0) {
        sourceExhausted = true;
        break;
      }

      const bills = (data as BillRow[]).filter((bill): bill is BillRow => Boolean(bill.openstates_bill_id));
      for (const bill of bills) {
        if (remaining <= 0 || Date.now() >= stopAt - DEADLINE_GUARD_MS) {
          break;
        }

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
          lastSuccessfulBillId = bill.id;
          remaining -= 1;
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
            lastSuccessfulBillId = bill.id;
            remaining -= 1;
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

          lastSuccessfulBillId = bill.id;
          remaining -= 1;
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
          failedBillId = bill.id;
          await sleep(RATE_LIMIT_DELAY_MS);
          break;
        }
      }

      if (failedBillId !== null) {
        break;
      }
      if (bills.length < fetchCount) {
        sourceExhausted = true;
      }
      if (remaining <= 0 || sourceExhausted) {
        break;
      }
    }

    const hasMore = failedBillId !== null || !sourceExhausted;
    const nowIso = new Date().toISOString();
    const cursor: CursorState = {
      last_bill_id: lastSuccessfulBillId,
      last_failed_bill_id: failedBillId,
      next_offset: null,
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
      errors: errorsPreview,
      skippedBills: skippedBillsPreview,
      continuation: {
        has_more: hasMore,
        next_bill_id: lastSuccessfulBillId,
        failed_bill_id: failedBillId,
        next_offset: null,
      },
      processed_window: {
        start_after_bill_id: startAfterBillId,
        end_at_bill_id: lastSuccessfulBillId,
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
