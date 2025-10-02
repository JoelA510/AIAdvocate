// supabase/functions/translate-bills/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { bill_ids, language_code } = await req.json();
    if (!Array.isArray(bill_ids) || !bill_ids.length) throw new Error("Missing or empty 'bill_ids'.");
    if (!language_code) throw new Error("Missing 'language_code'.");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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

    // Translate in small batches
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
      generationConfig: { responseMimeType: "application/json" },
    });

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

          const res = await model.generateContent(prompt);
          const obj = JSON.parse(res.response.text());

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
    console.error("translate-bills failed:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
