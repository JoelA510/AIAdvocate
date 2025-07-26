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

const RELEVANT_KEYWORDS = [
  'trafficking', 'human trafficking', 'human trafficker', 'trafficked',
  'victim', 'survivor', 'abuse', 'coercion', 'assault', 
  'domestic violence', 'sexual violence', 'sex work', 
  'sex worker', 'prostitution', 'solicitation'
];

const KEYWORD_REGEX = new RegExp(`\\b(${RELEVANT_KEYWORDS.join('|')})\\b`, 'i');

console.log("🚀 Initializing sync-updated-bills v9 (Consolidated & Final)");

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

    const masterListUrl = `https://api.legiscan.com/?op=getMasterListRaw&id=${SESSION_ID}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
    const masterListResponse = await fetch(masterListUrl, { headers: BROWSER_HEADERS });
    if (!masterListResponse.ok) throw new Error("Failed to fetch master list.");
    
    const { masterlist } = await masterListResponse.json();
    if (!masterlist) throw new Error("Master list not found in response.");
    
    const legiscanBills = Object.values(masterlist);
    const { data: ourBills } = await supabaseAdmin.from("bills").select("id, change_hash");
    const ourBillsMap = new Map(ourBills.map(b => [b.id, b.change_hash]));

    let billToProcessId = null;
    for (const legiscanBill of legiscanBills) {
      if (KEYWORD_REGEX.test(legiscanBill.title) && ourBillsMap.get(legiscanBill.bill_id) !== legiscanBill.change_hash) {
        billToProcessId = legiscanBill.bill_id;
        break; 
      }
    }

    if (!billToProcessId) {
      return new Response(JSON.stringify({ message: "Sync complete. No new relevant bills to process." }), { headers: corsHeaders });
    }

    console.log(`Processing relevant bill ID: ${billToProcessId}...`);

    const billDetailsUrl = `https://api.legiscan.com/?op=getBill&id=${billToProcessId}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
    const billDetailsRes = await fetch(billDetailsUrl, { headers: BROWSER_HEADERS });
    const { bill: billData } = await billDetailsRes.json();
    const docId = billData.texts[billData.texts.length - 1]?.doc_id;

    if (!docId) {
      await supabaseAdmin.from("bills").upsert({ id: billToProcessId, change_hash: billData.change_hash, title: billData.title, bill_number: billData.bill_number, summary_simple: "No text available." });
      throw new Error(`Skipping bill ${billToProcessId}: No document text found.`);
    }

    const billTextUrl = `https://api.legiscan.com/?op=getBillText&id=${docId}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
    const billTextRes = await fetch(billTextUrl, { headers: BROWSER_HEADERS });
    const { text: textData } = await billTextRes.json();
    const originalText = atob(textData.doc);

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