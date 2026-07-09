// supabase/functions/translate-bills/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { corsHeaders } from "../_shared/cors.ts";
import { getOpenAiKey, getServiceKey } from "../_shared/utils.ts";

type TranslationRow = {
  bill_id: number;
  language_code: string;
  title?: string | null;
  description?: string | null;
  summary_simple?: string | null;
  summary_medium?: string | null;
  summary_complex?: string | null;
  original_text?: string | null;
  created_at?: string;
};

const jsonError = (message: string, status: number) =>
  new Response(JSON.stringify({ error: message }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let bill_ids;
  let language_code;
  try {
    ({ bill_ids, language_code } = await req.json());
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  // Validation errors return immediately with a hardcoded literal message --
  // never anything derived from a caught exception -- so there is no code
  // path where upstream/internal error detail can reach the HTTP response
  // (CodeQL: information exposure through a stack trace).
  if (!Array.isArray(bill_ids) || !bill_ids.length) {
    return jsonError("Missing or empty 'bill_ids'.", 400);
  }
  if (!language_code) {
    return jsonError("Missing 'language_code'.", 400);
  }
  // Bound the per-request OpenAI fan-out: without a cap, one request could
  // trigger an unlimited number of paid completions (cost blowout / DoS),
  // even now that a caller must be an authenticated session.
  const MAX_BILL_IDS = 50;
  if (bill_ids.length > MAX_BILL_IDS) {
    return jsonError(`Too many bill_ids (max ${MAX_BILL_IDS}).`, 400);
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      getServiceKey()
    );

    // Cache-first
    const { data: cached, error: cacheErr } = await supabase
      .from("bill_translations")
      .select("*")
      .eq("language_code", language_code)
      .in("bill_id", bill_ids);
    if (cacheErr) throw cacheErr;

    const cachedMap = new Map<number, TranslationRow>();
    (cached ?? []).forEach((r) => cachedMap.set(r.bill_id, r as TranslationRow));
    const missingIds = bill_ids.filter((id: number) => !cachedMap.has(id));
    if (!missingIds.length) {
      return new Response(JSON.stringify(cached ?? []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Fetch source rows to translate
    const { data: sources, error: srcErr } = await supabase
      .from("bills")
      .select("id, title, description, summary_simple, summary_medium, summary_complex, original_text")
      .in("id", missingIds);
    if (srcErr) throw srcErr;
    if (!sources?.length) {
      return new Response(JSON.stringify(cached ?? []), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Translate in small batches using OpenAI ChatGPT
    const openAiKey = getOpenAiKey();

    const created: TranslationRow[] = [];
    const BATCH = 5;

    for (let i = 0; i < sources.length; i += BATCH) {
      const slice = sources.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        slice.map(async (bill) => {
          const prompt = `
Translate the following legislative bill content to language "${language_code}".
Return a JSON object with EXACT keys:
"title", "description", "summary_simple", "summary_medium", "summary_complex", "original_text".

Original (JSON):
${JSON.stringify({
  title: bill.title,
  description: bill.description,
  summary_simple: bill.summary_simple,
  summary_medium: bill.summary_medium,
  summary_complex: bill.summary_complex,
  original_text: bill.original_text,
})}
          `.trim();

          const res = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${openAiKey}`,
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              response_format: { type: "json_object" },
              messages: [
                {
                  role: "system",
                  content: "You are a professional legislative translator who only replies with strict JSON objects.",
                },
                { role: "user", content: prompt },
              ],
            }),
          });

          if (!res.ok) {
            const errorTxt = await res.text();
            throw new Error(`OpenAI chat completion failed (${res.status}): ${errorTxt}`);
          }

          const payload = await res.json();
          const content = payload?.choices?.[0]?.message?.content;
          if (!content) throw new Error("OpenAI chat completion returned no content.");

          const obj = JSON.parse(content.trim());

          const row: TranslationRow = {
            bill_id: bill.id,
            language_code,
            title: obj.title ?? null,
            description: obj.description ?? null,
            summary_simple: obj.summary_simple ?? null,
            summary_medium: obj.summary_medium ?? null,
            summary_complex: obj.summary_complex ?? null,
            original_text: obj.original_text ?? null,
          };
          return row;
        })
      );

      const toInsert: TranslationRow[] = [];
      results.forEach((r, idx) => {
        if (r.status === "fulfilled" && r.value) toInsert.push(r.value);
        else console.error("translate-bills error for bill", slice[idx]?.id, r);
      });

      if (toInsert.length) {
        const { data: upserted, error: upErr } = await supabase
          .from("bill_translations")
          .upsert(toInsert, { onConflict: "bill_id,language_code" })
          .select("*");
        if (upErr) console.error("Failed caching translations:", upErr);
        (upserted ?? toInsert).forEach((row) => created.push(row as TranslationRow));
      }
    }

    const all = [...(cached ?? []), ...created];
    const filtered = all.filter((r) => bill_ids.includes(r.bill_id));
    return new Response(JSON.stringify(filtered), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err: any) {
    // Log full detail server-side only. The response body is always this
    // fixed literal -- never any part of `err` -- so upstream OpenAI error
    // text or internal detail can never reach the client.
    const message = err instanceof Error ? err.message : String(err);
    console.error("translate-bills failed:", message);
    return jsonError("Failed to translate bills.", 500);
  }
});
