import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "https://deno.land/x/openai@v4.24.0/mod.ts";

type BillRow = {
  id: number
  bill_number: string
  title: string | null
  description: string | null
  original_text: string | null
  summary_simple: string | null
  is_curated: boolean | null
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

const db = createClient(supabaseUrl, serviceKey);
const openai = new OpenAI({ apiKey: openaiKey });

const SYS_PROMPT = `You are a legislative explainer. Produce a 2–4 sentence,
plain-English summary suitable for the general public. Avoid legalese.
Keep it neutral, factual, and ≤ 120 words.`;

async function generateSimpleSummary(input: string): Promise<string> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYS_PROMPT },
      { role: "user", content: input }
    ],
    temperature: 0.3,
    max_tokens: 180
  });
  const content = res.choices?.[0]?.message?.content?.trim() ?? "";
  if (!content) throw new Error("Empty OpenAI response");
  return content;
}

function isPlaceholder(s: string | null): boolean {
  if (!s) return false;
  return /^Placeholder for\s/i.test(s);
}

Deno.serve(async (req) => {
  try {
    const { bill_id } = await req.json();

    if (!bill_id) {
      return new Response("bill_id required", { status: 400 });
    }

    const { data: bill, error } = await db
      .from("bills")
      .select("id,bill_number,title,description,original_text,summary_simple,is_curated")
      .eq("id", bill_id)
      .single<BillRow>();
    if (error || !bill) throw error ?? new Error("Bill not found");

    if (bill.is_curated) {
      return new Response("Skipped: is_curated", { status: 200 });
    }

    if (bill.summary_simple && !isPlaceholder(bill.summary_simple)) {
      return new Response("Skipped: already summarized", { status: 200 });
    }

    const source =
      bill.original_text?.slice(0, 6000) ??
      `${bill.title ?? bill.bill_number}\n\n${bill.description ?? ""}`;

    const summary = await generateSimpleSummary(source);

    const { error: upErr } = await db
      .from("bills")
      .update({ summary_simple: summary })
      .eq("id", bill.id);
    if (upErr) throw upErr;

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response(`Error: ${String(e)}`, { status: 500 });
  }
});
