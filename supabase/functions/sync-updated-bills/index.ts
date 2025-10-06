// supabase/functions/sync-updated-bills/index.ts
// VERSION 2.2: Added Vector Embedding Generation

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

// --- Configuration ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

console.log("🚀 Initializing sync-updated-bills v2.2 (Embeddings)");

function cleanText(rawText: string): string {
    if (!rawText) return '';
    let cleanedText = rawText;
    if (cleanedText.trim().startsWith('<')) {
        try {
            const dom = new DOMParser().parseFromString(cleanedText, "text/html");
            cleanedText = dom?.body.textContent ?? '';
        } catch (e) { console.error("DOMParser failed, falling back to raw text cleaning.", e); }
    }
    cleanedText = cleanedText
      .replace(/ /g, ' ')
      .replace(/Â/g, '')
      .replace(/\uFFFD/g, '')
      .replace(/\s\s+/g, ' ')
      .trim();
    return cleanedText;
}

// --- Main Server Logic ---
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // --- API and Client Initialization ---
    const legiscanApiKey = Deno.env.get("LEGISCAN_API_KEY");
    const openAiKey = Deno.env.get("OpenAI_GPT_Key");
    if (!legiscanApiKey || !openAiKey) {
      throw new Error("API keys (LEGISCAN_API_KEY, OpenAI_GPT_Key) are not set.");
    }

    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // --- Find a Bill to Process ---
    const { data: billToProcess, error: findBillError } = await supabaseAdmin
        .from("bills").select("id").or('summary_simple.ilike.Placeholder for%,summary_simple.ilike.AI_SUMMARY_FAILED%').limit(1).single();

    if (findBillError) {
        if (findBillError.code === 'PGRST116') {
            return new Response(JSON.stringify({ message: "Sync complete. All bills are up-to-date." }), { headers: corsHeaders });
        }
        throw findBillError;
    }

    const billId = billToProcess.id;
    console.log(`Processing bill ID: ${billId}...`);

    // --- Fetch and Clean Bill Text from LegiScan ---
    const billDetailsUrl = `https://api.legiscan.com/?op=getBill&id=${billId}&key=${legiscanApiKey}`;
    const billDetailsRes = await fetch(billDetailsUrl, { headers: BROWSER_HEADERS });
    const { bill: billData } = await billDetailsRes.json();
    
    let rawTextForCleaning;
    const latestTextDoc = billData.texts?.length > 0 ? billData.texts[billData.texts.length - 1] : null;

    if (latestTextDoc?.doc_id) {
        const billTextUrl = `https://api.legiscan.com/?op=getBillText&id=${latestTextDoc.doc_id}&key=${legiscanApiKey}`;
        const billTextRes = await fetch(billTextUrl, { headers: BROWSER_HEADERS });
        const { text: textData } = await billTextRes.json();
        const binaryString = atob(textData.doc);
        const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
        const decoder = new TextDecoder('utf-8', { fatal: false });
        rawTextForCleaning = decoder.decode(bytes);
    } else {
        console.log(`- Bill ${billData.bill_number} has no text document. Using title as fallback.`);
        rawTextForCleaning = billData.title;
    }

    const originalText = cleanText(rawTextForCleaning);

    if (!originalText) {
        await supabaseAdmin.from("bills").update({ summary_simple: "No text available." }).eq('id', billId);
        return new Response(JSON.stringify({ message: `Skipped bill ${billId} (no text found).` }), { headers: corsHeaders });
    }

    // --- Step 1: Generate 3-Tier Summaries ---
    console.log(`- Generating 3-tier verbose summary for ${billData.bill_number}...`);
    const summaryPrompt = `
      Analyze the following legislative text and return a JSON object with three summaries.
      The JSON object MUST have ONLY these three keys: "simple", "medium", and "complex".

      - "simple": "A comprehensive summary that thoroughly explains the bill, written at a 5th-grade reading level. Use at least one full paragraph. The goal is complete understanding for a young reader, not brevity."
      - "medium": "A detailed summary for a general audience, written at a 10th-grade reading level. Use at least two full paragraphs to explain the bill's purpose, main provisions, and potential impact. The goal is thoroughness for a motivated layperson."
      - "complex": "A detailed summary for a policy expert, mentioning specific legal changes, sections of code amended, and potential legal implications. The tone should be formal, objective, and comprehensive."

      Legislative Text:
      ---
      ${originalText}
    `;
    const summaryResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
            content: "You analyze legislative text and return strictly valid JSON with tiered summaries.",
          },
          { role: "user", content: summaryPrompt.trim() },
        ],
      }),
    });

    if (!summaryResponse.ok) {
      const errorDetails = await summaryResponse.text();
      throw new Error(`OpenAI chat completion failed (${summaryResponse.status}): ${errorDetails}`);
    }

    const summaryPayload = await summaryResponse.json();
    const summaryContent = summaryPayload?.choices?.[0]?.message?.content;
    if (!summaryContent) {
      throw new Error("OpenAI chat completion returned no summary content.");
    }

    const summaries = JSON.parse(summaryContent.trim());

    // --- Step 2: Generate Vector Embedding ---
    console.log(`- Generating vector embedding for ${billData.bill_number}...`);
    const textForEmbedding = [
        `Title: ${billData.title}`,
        `Description: ${billData.description}`,
        `Expert Summary: ${summaries.complex}`
    ].join("\n\n");

    const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: textForEmbedding,
      }),
    });

    if (!embeddingResponse.ok) {
      const embeddingError = await embeddingResponse.text();
      throw new Error(`OpenAI embedding request failed (${embeddingResponse.status}): ${embeddingError}`);
    }

    const embeddingPayload = await embeddingResponse.json();
    const embedding = embeddingPayload?.data?.[0]?.embedding;
    if (!embedding) {
      throw new Error("OpenAI embedding response was missing embedding data.");
    }

    // --- Step 3: Update Database with Summaries, Text, and Embedding ---
    const statusText = billData.status_text ?? null;
    const statusDate = billData.status_date ?? null;
    const progress = Array.isArray(billData.progress) ? billData.progress : [];
    const calendar = Array.isArray(billData.calendar) ? billData.calendar : [];
    const history = Array.isArray(billData.history) ? billData.history : [];

    const billToUpsert = {
        id: billData.bill_id,
        bill_number: billData.bill_number,
        title: billData.title,
        description: billData.description,
        status: String(billData.status),
        status_text: statusText,
        status_date: statusDate,
        state_link: billData.state_link,
        change_hash: billData.change_hash,
        original_text: originalText,
        summary_simple: summaries.simple,
        summary_medium: summaries.medium,
        summary_complex: summaries.complex,
        progress,
        calendar,
        history,
        embedding,
    };

    const { error: upsertError } = await supabaseAdmin.from("bills").upsert(billToUpsert, { onConflict: "id" });
    if (upsertError) throw upsertError;

    const successMessage = `✅ Successfully processed, summarized, and embedded bill ${billData.bill_number}.`;
    console.log(successMessage);
    return new Response(JSON.stringify({ message: successMessage }), { headers: corsHeaders });

  } catch (error) {
    console.error("Function failed:", error);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 500, headers: corsHeaders
    });
  }
});
