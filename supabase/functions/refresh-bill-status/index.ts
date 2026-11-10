// supabase/functions/refresh-bill-status/index.ts
//
// Refreshes status, status date, history, progress and hearings for every
// tracked bill from the Legislature's pubinfo archive. No LegiScan calls and
// no OpenAI calls. Scheduled daily by pg_cron ('bill-status-refresh'); POST
// {"dry_run": true} to see what would change without writing.

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { isAuthorizedCronOrAdmin } from "../_shared/auth.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { ensureEnv, getServiceKey } from "../_shared/utils.ts";
import {
  refreshBillStatuses,
  type RefreshStats,
  type StatusUpdate,
  type TrackedBill,
} from "./refresh.ts";

export const STATS_CURSOR_KEY = "bill_status_refresh";
const PAGE_SIZE = 500;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method Not Allowed" }, 405);
  }
  if (!(await isAuthorizedCronOrAdmin(req))) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;
    const supabaseAdmin = createClient(
      ensureEnv("SUPABASE_URL"),
      getServiceKey(),
      { auth: { persistSession: false } },
    );

    const stats: RefreshStats = await refreshBillStatuses({
      listBills: async () => {
        const bills: TrackedBill[] = [];
        for (let from = 0;; from += PAGE_SIZE) {
          const { data, error } = await supabaseAdmin
            .from("bills")
            .select(
              "id,state_link,status,status_date,history,progress,calendar",
            )
            .order("id")
            .range(from, from + PAGE_SIZE - 1);
          if (error) throw new Error(`bills query failed: ${error.message}`);
          bills.push(...((data ?? []) as TrackedBill[]));
          if (!data || data.length < PAGE_SIZE) break;
        }
        return bills;
      },
      // Source fields only. Summaries, embeddings and text are never touched
      // (AGENTS.md section 11).
      updateBill: async (id: number, changes: StatusUpdate) => {
        const { error } = await supabaseAdmin
          .from("bills")
          .update(changes)
          .eq("id", id);
        if (error) throw new Error(error.message);
      },
      saveStats: async (value: RefreshStats) => {
        const { error } = await supabaseAdmin
          .from("ingestion_cursors")
          .upsert({
            key: STATS_CURSOR_KEY,
            cursor: value,
            updated_at: new Date().toISOString(),
          }, { onConflict: "key" });
        if (error) throw new Error(error.message);
      },
    }, { dryRun });

    console.log("refresh-bill-status finished", {
      ...stats,
      samples: undefined,
    });
    // Non-2xx when the source was unreachable, so net._http_response shows it.
    const lookedUp = stats.tracked - stats.without_pubinfo_id;
    const failed = stats.blocked || (lookedUp > 0 && stats.matched === 0);
    return json(stats, failed ? 502 : 200);
  } catch (error) {
    console.error("refresh-bill-status failed", error);
    return json({
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
