// supabase/functions/translate-bill/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

console.log("🚀 Initializing translate-bill v1.0");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { bill_id, language_code } = await req.json();
    if (!bill_id || !language_code) {
      throw new Error("Missing required parameters: 'bill_id' and 'language_code'.");
    }

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // --- 1. Check for a cached translation first ---
    const { data: cachedTranslation } = await supabaseAdmin
      .from("bill_translations")
      .select("*")
      .eq("bill_id", bill_id)
      .eq("language_code", language_code)
      .single();

    if (cachedTranslation) {
      console.log(`✅ Cache hit for bill #${bill_id} [${language_code}]. Returning cached data.`);
      return new Response(JSON.stringify(cachedTranslation), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    console.log(`...Cache miss for bill #${bill_id} [${language_code}]. Generating new translation.`);

    // --- 2. If no cache, fetch the original bill content ---
    const { data: originalBill, error: billError } = await supabaseAdmin
      .from("bills")
      .select("title, description, summary_simple, summary_medium, summary_complex")
      .eq("id", bill_id)
      .single();

    if (billError) throw billError;

    // --- 3. Generate the translation with OpenAI ChatGPT ---
    const openAiKey = Deno.env.get("OpenAI_GPT_Key");
    if (!openAiKey) throw new Error("OpenAI_GPT_Key is not set.");

    const prompt = `
      Translate the following legislative bill content into the language with ISO 639-1 code "${language_code}".
      Return a JSON object with the exact keys: "title", "description", "summary_simple", "summary_medium", "summary_complex".
      Ensure the translation is accurate and maintains the professional tone of the original text.

      Original Content (JSON):
      ---
      ${JSON.stringify(originalBill)}
    `;

    const chatResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
            content: "You are a professional legislative translator who returns strictly valid JSON responses.",
          },
          { role: "user", content: prompt.trim() },
        ],
      }),
    });

    if (!chatResponse.ok) {
      const errorDetails = await chatResponse.text();
      throw new Error(`OpenAI chat completion failed (${chatResponse.status}): ${errorDetails}`);
    }

    const chatPayload = await chatResponse.json();
    const rawContent = chatPayload?.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error("OpenAI chat completion returned no content.");
    }

    const newTranslation = JSON.parse(rawContent.trim());

    // --- 4. Cache the new translation in the database ---
    const translationToCache = { bill_id, language_code, ...newTranslation };

    const { error: insertError } = await supabaseAdmin
      .from("bill_translations")
      .insert(translationToCache);

    if (insertError) {
      console.error("Failed to cache translation:", insertError);
    } else {
      console.log(`✅ Successfully cached new translation for bill #${bill_id} [${language_code}].`);
    }

    // --- 5. Return the newly generated translation ---
    return new Response(JSON.stringify(translationToCache), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Function failed:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
