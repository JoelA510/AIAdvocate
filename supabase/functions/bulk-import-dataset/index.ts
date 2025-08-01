// supabase/functions/bulk-import-dataset/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip";
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

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

console.log("🚀 Initializing bulk-import-dataset v32 (Final Logic)");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const legiscanApiKey = Deno.env.get("LEGISCAN_API_KEY");
    if (!legiscanApiKey) throw new Error("LEGISCAN_API_KEY is not set.");
    
    // --- STEP 1: Get the active session dataset ---
    console.log("Fetching dataset list to find the active session...");
    const datasetListUrl = `https://api.legiscan.com/?key=${legiscanApiKey}&op=getDatasetList&state=CA`;
    const datasetListResponse = await fetch(datasetListUrl, { headers: BROWSER_HEADERS });
    const datasetListJson = await datasetListResponse.json();
    if (datasetListJson.status !== "OK" || !datasetListJson.datasetlist) {
      throw new Error("Failed to get a valid dataset list from LegiScan.");
    }

    // **THE FIX:** The simplest possible logic. Find the one object where prior is 0.
    const activeDataset = datasetListJson.datasetlist.find(d => d.prior === 0);

    if (!activeDataset) {
      console.error("Complete dataset list:", JSON.stringify(datasetListJson.datasetlist, null, 2));
      throw new Error("Could not find an active (non-prior) session in the dataset list.");
    }
    
    const { session_id, access_key } = activeDataset;
    console.log(`Found active session to import: ${activeDataset.session_title}`);

    // --- STEP 2: Fetch the dataset ZIP ---
    const legiscanUrl = `https://api.legiscan.com/?op=getDataset&id=${session_id}&key=${legiscanApiKey}&access_key=${access_key}`;
    const legiscanResponse = await fetch(legiscanUrl, { headers: BROWSER_HEADERS });
    const legiscanJson = await legiscanResponse.json();
    const { dataset } = legiscanJson;
    if (!dataset?.zip) { throw new Error("No 'dataset.zip' property found in the final response."); }
    
    // --- STEP 3: Process and FILTER bills from the ZIP ---
    console.log("✅ Dataset received! Filtering and processing relevant bills...");
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const zip = new JSZip();
    await zip.loadAsync(dataset.zip, { base64: true });
    
    const billsToUpsert = [];
    for (const file of Object.values(zip.files)) {
      if (file.name.includes('/bill/') && !file.dir) {
        try {
          const billJsonText = await file.async("text");
          const billData = JSON.parse(billJsonText).bill;

          if (KEYWORD_REGEX.test(billData.title)) {
            let originalText = '';
            const latestTextDoc = billData.texts?.[billData.texts.length - 1];
            if (latestTextDoc?.doc) {
                const binaryString = atob(latestTextDoc.doc);
                const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
                const decoder = new TextDecoder('utf-8');
                const rawHtml = decoder.decode(bytes);
                
                if (rawHtml.trim().startsWith('<')) {
                    const dom = new DOMParser().parseFromString(rawHtml, "text/html");
                    originalText = dom?.body.textContent?.trim() ?? '';
                } else {
                    originalText = rawHtml;
                }
            }
            
            billsToUpsert.push({
                id: billData.bill_id, bill_number: billData.bill_number, title: billData.title,
                description: billData.description, status: String(billData.status),
                state_link: billData.state_link, change_hash: billData.change_hash,
                original_text: originalText,
                summary_simple: `Placeholder for ${billData.bill_number}.`,
                summary_medium: `Placeholder for ${billData.bill_number}.`,
                summary_complex: `Placeholder for ${billData.bill_number}.`,
            });
          }
        } catch (e) { console.error(`Skipping file: ${file.name}`, e); }
      }
    }
    
    console.log(`✅ Processed and found ${billsToUpsert.length} relevant bills to import.`);
    if (billsToUpsert.length === 0) {
      return new Response(JSON.stringify({ message: `No new bills matching the keywords were found in this dataset.` }), {
        headers: { "Content-Type": "application/json" }, status: 200,
      });
    }

    // --- STEP 4: Save to database ---
    const CHUNK_SIZE = 500;
    for (let i = 0; i < billsToUpsert.length; i += CHUNK_SIZE) {
      const chunk = billsToUpsert.slice(i, i + CHUNK_SIZE);
      console.log(`Importing chunk ${Math.floor(i / CHUNK_SIZE) + 1}...`);
      const { error } = await supabaseAdmin.from("bills").upsert(chunk, { onConflict: "id" });
      if (error) throw error;
    }

    console.log("✅🎉 VICTORY! Successfully imported all relevant bills!");

    return new Response(JSON.stringify({ message: `Successfully imported ${billsToUpsert.length} relevant bills.` }), {
      headers: { "Content-Type": "application/json" }, status: 200,
    });
  } catch (error) {
    console.error("Function failed:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" }, status: 500,
    });
  }
});