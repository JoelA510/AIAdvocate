import { createClient } from "npm:@supabase/supabase-js@2";
import {
  ensureEnv,
  invokeFunction,
  isPlaceholder,
  runConcurrent,
} from "../_shared/utils.ts";

const supabaseUrl = ensureEnv("SUPABASE_URL");
const serviceKey = ensureEnv("SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(supabaseUrl, serviceKey);

const parsedConcurrency = Number(Deno.env.get("BACKFILL_CONCURRENCY"));
const CONCURRENCY = Number.isFinite(parsedConcurrency) && parsedConcurrency > 0
  ? Math.floor(parsedConcurrency)
  : 5;
const BATCH_SIZE = 200;
const TARGET_FILTER = [
  "summary_simple.is.null.and(is_curated.is.null)",
  "summary_simple.is.null.and(is_curated.eq.false)",
  "summary_simple.ilike.Placeholder%.and(is_curated.is.null)",
  "summary_simple.ilike.Placeholder%.and(is_curated.eq.false)",
].join(",");

Deno.serve(async (_req) => {
  let totalUpdated = 0;

  while (true) {
    const { data: rows, error } = await db
      .from("bills")
      .select("id,summary_simple,is_curated")
      .or(TARGET_FILTER)
      .order("id", { ascending: true })
      .range(0, BATCH_SIZE - 1);

    if (error) {
      return new Response(`DB error: ${error.message}`, { status: 500 });
    }

    if (!rows?.length) {
      break;
    }

    const ids = rows
      .filter((row) => !row.summary_simple || isPlaceholder(row.summary_simple))
      .map((row) => row.id);

    if (!ids.length) {
      continue;
    }

    let updated = 0;
    await runConcurrent(ids, CONCURRENCY, async (id) => {
      try {
        const resp = await invokeFunction({
          url: `${supabaseUrl}/functions/v1/summarize-simple`,
          token: serviceKey,
          body: { bill_id: id },
        });

        if (resp.ok) {
          updated++;
        } else {
          console.error(
            `Failed bill ${id}: ${resp.status} ${await resp.text()}`,
          );
        }
      } catch (err) {
        console.error(`Error bill ${id}:`, err);
      }
    });

    totalUpdated += updated;
  }

  return new Response(`Backfill complete. totalUpdated=${totalUpdated}`, {
    status: 200,
  });
});
