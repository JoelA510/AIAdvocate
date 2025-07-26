// supabase/functions/sync-updated-bills/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

// --- Configuration ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SESSION_ID = 2172;
const DATASET_ACCESS_KEY = "xMfz6U5b64iqAwoAsWGY0";
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

console.log("🚀 Initializing sync-updated-bills v13 (Callable & Defensive)");

serve(async (req) => {
  if (req.method === "GET") {
    return new Response(JSON.stringify({ message: "Function is alive" }), { headers: corsHeaders });
  }
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const legiscanApiKey = Deno.env.get("LEGISCAN_API_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!legiscanApiKey || !geminiApiKey) throw new Error("API keys are not set.");
    
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    const getSummary = async (prompt, text) => {
      try {
        const fullPrompt = `${prompt}\n\n---\n\n${text}`;
        const result = await model.generateContent(fullPrompt);
        return result.response.text();
      } catch (e) {
        console.error(`Gemini API call failed: ${e.message}`);
        return `AI_SUMMARY_FAILED: ${e.message}`;
      }
    };

    // **THE FIX:** Check if the script sent us a specific bill_id to process.
    const { bill_id: requestedBillId } = (await req.json()) || {};
    
    let billToProcessId;

    if (requestedBillId) {
      // If we were told which bill to process, use that one.
      billToProcessId = requestedBillId;
      console.log(`Received request to process specific bill ID: ${billToProcessId}`);
    } else {
      // Otherwise, find the next one in the queue automatically (for the cron job).
      console.log("Searching for the next bill with a placeholder summary...");
      const { data: billToProcess, error: findBillError } = await supabaseAdmin
        .from("bills")
        .select("id")
        .ilike('summary_simple', 'Placeholder for%')
        .limit(1)
        .single();
      
      if (findBillError) {
        if (findBillError.code === 'PGRST116') { // No rows found
          return new Response(JSON.stringify({ message: "Sync complete. All bills are up-to-date." }), { headers: corsHeaders });
        }
        throw findBillError;
      }
      billToProcessId = billToProcess.id;
    }
    
    console.log(`Processing bill ID: ${billToProcessId}...`);
    
    const billDetailsUrl = `https://api.legiscan.com/?op=getBill&id=${billToProcessId}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
    const billDetailsRes = await fetch(billDetailsUrl, { headers: BROWSER_HEADERS });
    const billDetailsJson = await billDetailsRes.json();
    if (!billDetailsJson.bill) throw new Error(`Failed to get bill details for ID: ${billToProcessId}`);
    const billData = billDetailsJson.bill;
    
    const doc = billData.texts && billData.texts.length > 0 ? billData.texts[billData.texts.length - 1] : null;
    if (!doc || !doc.doc_id) {
      console.log(`- Bill ${billData.bill_number} has no text. Marking as processed and skipping.`);
      await supabaseAdmin.from("bills").upsert({ 
        id: billData.bill_id, bill_number: billData.bill_number, title: billData.title,
        change_hash: billData.change_hash, summary_simple: "No text available from source.",
      });
      return new Response(JSON.stringify({ message: `Skipped bill ${billData.bill_number} (no text).` }), { headers: corsHeaders });
    }

    const billTextUrl = `https://api.legiscan.com/?op=getBillText&id=${doc.doc_id}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
    const billTextRes = await fetch(billTextUrl, { headers: BROWSER_HEADERS });
    const { text: textData } = await billTextRes.json();
    const originalText = atob(textData.doc);

    console.log(`- Generating summaries for ${billData.bill_number}...`);
    const [summarySimple, summaryMedium, summaryComplex] = await Promise.all([
        getSummary("Explain and summarize this legislative bill to a 12 year old. Be as verbose as needed not to miss a detail.", originalText),
        getSummary("Explain and summarize this legislative bill to a 16 year old. Be as verbose as needed not to miss a detail.", originalText),
        getSummary("Explain and summarize this legislative bill to a policy expert in plain language. Be as verbose as needed not to miss a detail.", originalText)
    ]);
      
    const billToUpsert = {
        id: billData.bill_id, bill_number: billData.bill_number, title: billData.title,
        description: billData.description, status: String(billData.status),
        state_link: billData.state_link, change_hash: billData.change_hash,
        original_text: originalText, summary_simple: summarySimple,
        summary_medium: summaryMedium, summary_complex: summaryComplex,
    };

    await supabaseAdmin.from("bills").upsert(billToUpsert, { onConflict: "id" });
    
    const successMessage = `✅ Successfully processed bill ${billData.bill_number}.`;
    return new Response(JSON.stringify({ message: successMessage }), { headers: corsHeaders });

  } catch (error) {
    console.error("Function failed:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: corsHeaders
    });
  }
});