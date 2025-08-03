// supabase/functions/bulk-import-dataset/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip";

// --- Configuration ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BROWSER_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
    'Host': 'api.legiscan.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};
const RELEVANT_KEYWORDS = [
  'trafficking', 'human trafficking', 'human trafficker', 'trafficked',
  'victim', 'survivor', 'abuse', 'coercion', 'assault',
  'domestic violence', 'sexual violence', 'sex work',
  'sex worker', 'prostitution', 'solicitation'
];
const KEYWORD_REGEX = new RegExp(`\\b(${RELEVANT_KEYWORDS.join('|')})\\b`, 'i');

console.log("🚀 Initializing bulk-import-dataset v37 (Correct Seeding Logic)");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const legiscanApiKey = Deno.env.get("LEGISCAN_API_KEY");
    if (!legiscanApiKey) throw new Error("LEGISCAN_API_KEY is not set.");
    
    // Step 1: Get active session
    const datasetListUrl = `https://api.legiscan.com/?key=${legiscanApiKey}&op=getDatasetList&state=CA`;
    const datasetListResponse = await fetch(datasetListUrl, { headers: BROWSER_HEADERS });
    const datasetListJson = await datasetListResponse.json();
    if (datasetListJson.status !== "OK") throw new Error("Failed to get dataset list.");
    const activeDataset = datasetListJson.datasetlist.find(d => d.prior === 0);
    if (!activeDataset) throw new Error("Could not find an active session.");
    
    // Step 2: Fetch dataset ZIP
    const { session_id, access_key } = activeDataset;
    console.log(`Found active session: ${activeDataset.session_title}. Fetching dataset...`);
    const legiscanUrl = `https://api.legiscan.com/?op=getDataset&id=${session_id}&key=${legiscanApiKey}&access_key=${access_key}`;
    const legiscanResponse = await fetch(legiscanUrl, { headers: BROWSER_HEADERS });
    const { dataset } = await legiscanResponse.json();
    if (!dataset?.zip) throw new Error("No 'dataset.zip' property found.");
    
    // Step 3: Process bill metadata from ZIP
    console.log("✅ Dataset received! Seeding database with bill metadata...");
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const zip = await new JSZip().loadAsync(dataset.zip, { base64: true });
    
    const billsToUpsert = [];
    for (const file of Object.values(zip.files)) {
      if (file.name.includes('/bill/') && !file.dir) {
        try {
          const billJsonText = await file.async("text");
          const { bill: billData } = JSON.parse(billJsonText);

          if (KEYWORD_REGEX.test(billData.title)) {
            // We only insert the metadata. The text and summaries will be filled by the worker.
            billsToUpsert.push({
                id: billData.bill_id,
                bill_number: billData.bill_number,
                title: billData.title,
                description: billData.description,
                status: String(billData.status),
                state_link: billData.state_link,
                change_hash: billData.change_hash,
                summary_simple: `Placeholder for ${billData.bill_number}.`, // Mark for processing
            });
          }
        } catch (e) { console.error(`Skipping file due to error: ${file.name}`, e); }
      }
    }
    
    if (billsToUpsert.length === 0) {
      return new Response(JSON.stringify({ message: "No new bills matching keywords found." }), {
        headers: { "Content-Type": "application/json" }, status: 200,
      });
    }

    // --- STEP 4: Save to database ---
    console.log(`✅ Found ${billsToUpsert.length} relevant bills. Seeding database...`);
    const CHUNK_SIZE = 500;
    for (let i = 0; i < billsToUpsert.length; i += CHUNK_SIZE) {
      const chunk = billsToUpsert.slice(i, i + CHUNK_SIZE);
      console.log(`Importing chunk ${Math.floor(i / CHUNK_SIZE) + 1}...`);
      const { error } = await supabaseAdmin.from("bills").upsert(chunk, { onConflict: "id" });
      if (error) throw error;
    }

    console.log("✅🎉 VICTORY! Successfully seeded database with all relevant bill metadata!");
    return new Response(JSON.stringify({ message: `Successfully seeded ${billsToUpsert.length} bills.` }), {
      headers: { "Content-Type": "application/json" }, status: 200,
    });

  } catch (error) {
    console.error("Function failed:", error.message, error.stack);
    return new Response(JSON.stringify({ error: error.message }), {
        headers: { "Content-Type": "application/json" }, status: 500,
    });
  }
});