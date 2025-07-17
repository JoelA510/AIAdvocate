// supabase/functions/sync-updated-bills/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SESSION_ID = 2172;
const DATASET_ACCESS_KEY = "xMfz6U5b64iqAwoAsWGY0";
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

console.log("🚀 Initializing sync-updated-bills function v6 (Resilient)");

serve(async (req) => {
  // **THE FIX:** Handle simple GET requests as a health check.
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
      // **THE FIX:** Adding a try/catch block specifically around the AI call.
      try {
        const fullPrompt = `${prompt}\n\n---\n\n${text}`;
        const result = await model.generateContent(fullPrompt);
        return result.response.text();
      } catch (e) {
        console.error(`Gemini API call failed: ${e.message}`);
        // Return a specific error message instead of crashing
        return `AI_SUMMARY_FAILED: ${e.message}`;
      }
    };

    const masterListUrl = `https://api.legiscan.com/?op=getMasterListRaw&id=${SESSION_ID}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
    const masterListResponse = await fetch(masterListUrl, { headers: BROWSER_HEADERS });
    if (!masterListResponse.ok) throw new Error("Failed to fetch master list.");
    
    const { masterlist } = await masterListResponse.json();
    if (!masterlist) throw new Error("Master list not found in response.");
    
    const { data: ourBills } = await supabaseAdmin.from("bills").select("id, change_hash").ilike('summary_simple', 'Placeholder for%');
    if (ourBills === null || ourBills.length === 0) {
      return new Response(JSON.stringify({ message: "Sync complete. All bills are up-to-date." }), { headers: corsHeaders });
    }

    const billToProcess = ourBills[0]; // Get the first bill that needs processing
    
    const billDetailsUrl = `https://api.legiscan.com/?op=getBill&id=${billToProcess.id}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
    const billDetailsRes = await fetch(billDetailsUrl, { headers: BROWSER_HEADERS });
    const { bill: billData } = await billDetailsRes.json();
    const docId = billData.texts[billData.texts.length - 1]?.doc_id;

    if (!docId) {
      // If no text, update the hash so we don't try again.
      await supabaseAdmin.from("bills").upsert({ id: billToProcess.id, change_hash: billData.change_hash, summary_simple: "No text available." });
      throw new Error(`Skipping bill ${billToProcess.id}: No document text found.`);
    }

    const billTextUrl = `https://api.legiscan.com/?op=getBillText&id=${docId}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
    const billTextRes = await fetch(billTextUrl, { headers: BROWSER_HEADERS });
    const { text: textData } = await billTextRes.json();
    const originalText = atob(textData.doc);

    const [summarySimple, summaryMedium, summaryComplex] = await Promise.all([
        getSummary("Explain this legislative bill to a 12-year-old.", originalText),
        getSummary("Summarize this legislative bill for a high school student.", originalText),
        getSummary("Provide a detailed summary of this bill for a policy expert.", originalText)
    ]);
      
    const billToUpsert = {
        id: billData.bill_id, change_hash: billData.change_hash,
        original_text: originalText, summary_simple: summarySimple,
        summary_medium: summaryMedium, summary_complex: summaryComplex,
    };

    const { error: upsertError } = await supabaseAdmin.from("bills").upsert(billToUpsert, { onConflict: "id" });
    if (upsertError) throw upsertError;

    const successMessage = `✅ Successfully processed bill ${billData.bill_number}.`;
    return new Response(JSON.stringify({ message: successMessage }), { headers: corsHeaders });

  } catch (error) {
    console.error("Function failed:", error);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 500, headers: corsHeaders
    });
  }
});