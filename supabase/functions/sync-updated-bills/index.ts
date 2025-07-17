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

console.log(" Initializing sync-updated-bills function v6 (process one bill per run)");

serve(async (_req) => {
  try {
    // 1. --- Initialize Clients and Get Secrets ---
    const legiscanApiKey = Deno.env.get("LEGISCAN_API_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!legiscanApiKey || !geminiApiKey) throw new Error("API keys are not set.");
    
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    // --- Helper function to generate a summary ---
    const getSummary = async (prompt: string, text: string) => {
        const fullPrompt = `${prompt}\n\n---\n\n${text}`;
        const result = await model.generateContent(fullPrompt);
        return result.response.text();
    };

    // 2. --- Get Master List & Find First Bill to Process ---
    const masterListUrl = `https://api.legiscan.com/?op=getMasterListRaw&id=${SESSION_ID}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
    console.log("Fetching master list...");
    const masterListResponse = await fetch(masterListUrl, { headers: BROWSER_HEADERS });
    if (!masterListResponse.ok) throw new Error("Failed to fetch master list.");
    
    const { masterlist } = await masterListResponse.json();
    if (!masterlist) throw new Error("Master list not found in response.");
    
    const legiscanBills = Object.values(masterlist);
    const { data: ourBills } = await supabaseAdmin.from("bills").select("id, change_hash");
    const ourBillsMap = new Map(ourBills.map(b => [b.id, b.change_hash]));
    
    const billToProcess = legiscanBills.find(bill => ourBillsMap.get(bill.bill_id) !== bill.change_hash);

    if (!billToProcess) {
      return new Response(JSON.stringify({ message: "Sync complete. No new bills to process." }), { headers: corsHeaders });
    }
    console.log(`Found bill to process: ${billToProcess.bill_id}`);

    // 3. --- Process the Bill (Fetch Text -> Generate Summaries) ---
    const billId = billToProcess.bill_id;
    console.log(`Processing bill ID: ${billId}...`);
    
    // Fetch the full bill details to get the doc_id
    const billDetailsUrl = `https://api.legiscan.com/?op=getBill&id=${billId}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
    const billDetailsRes = await fetch(billDetailsUrl, { headers: BROWSER_HEADERS });
    const { bill: billData } = await billDetailsRes.json();
    const docId = billData.texts[billData.texts.length - 1]?.doc_id;

    if (!docId) {
      console.log(`Skipping bill ${billId}: No document text found.`);
      // We should probably mark this bill as processed anyway to avoid getting stuck
      await supabaseAdmin.from("bills").upsert({ id: billId, change_hash: billToProcess.change_hash }, { onConflict: "id" });
      return new Response(JSON.stringify({ message: `Skipped bill ${billId}: No document text found.` }), { headers: corsHeaders });
    }

    // Fetch the a full bill text using the doc_id
    const billTextUrl = `https://api.legiscan.com/?op=getBillText&id=${docId}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
    const billTextRes = await fetch(billTextUrl, { headers: BROWSER_HEADERS });
    const { text: textData } = await billTextRes.json();
    const originalText = atob(textData.doc); // The text is Base64 encoded

    console.log(`- Generating summaries for bill ${billId}...`);

    // Generate all three summaries in parallel for efficiency
    const [summarySimple, summaryMedium, summaryComplex] = await Promise.all([
      getSummary("Explain this legislative bill to a 12-year-old in simple, clear language.", originalText),
      getSummary("Summarize this legislative bill for a well-informed high school student.", originalText),
      getSummary("Provide a detailed, nuanced summary of this bill for a policy expert, covering its key articles and potential implications.", originalText)
    ]);
    
    const billToUpsert = {
      id: billData.bill_id, bill_number: billData.bill_number, title: billData.title,
      description: billData.description, status: String(billData.status),
      state_link: billData.state_link, change_hash: billData.change_hash,
      original_text: originalText,
      summary_simple: summarySimple,
      summary_medium: summaryMedium,
      summary_complex: summaryComplex,
    };

    // 4. --- Upsert the Processed Bill ---
    console.log(`Upserting processed bill ${billId} to the database...`);
    const { error: upsertError } = await supabaseAdmin.from("bills").upsert(billToUpsert, { onConflict: "id" });
    if (upsertError) throw upsertError;

    const successMessage = `✅ AI Sync complete! Successfully processed and upserted bill ${billId}.`;
    console.log(successMessage);
    return new Response(JSON.stringify({ message: successMessage }), { headers: corsHeaders });

  } catch (error) {
    console.error("Function failed:", error);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 500, headers: corsHeaders
    });
  }
});