import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceKey);

function isPlaceholder(s: string | null): boolean {
  return !!s && /^Placeholder for\s/i.test(s);
}

Deno.serve(async (_req) => {
  let from = 0;
  const size = 200;
  let updated = 0;

  while (true) {
    const { data: rows, error } = await db
      .from("bills")
      .select("id,summary_simple,is_curated")
      .or("summary_simple.is.null,summary_simple.ilike.Placeholder%")
      .order("id", { ascending: true })
      .range(from, from + size - 1);

    if (error) {
      return new Response(`DB error: ${error.message}`, { status: 500 });
    }
    if (!rows?.length) break;

    for (const r of rows) {
      if (r.is_curated) continue;
      if (r.summary_simple && !isPlaceholder(r.summary_simple)) continue;

      const resp = await fetch(
        `${supabaseUrl}/functions/v1/summarize-simple`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`
          },
          body: JSON.stringify({ bill_id: r.id })
        }
      );
      if (resp.ok) updated++;
    }

    from += size;
  }

  return new Response(`Backfill complete, updated=${updated}`, { status: 200 });
});
