// supabase/functions/bulk-import-dataset/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SESSION_ID = 2172; 
const DATASET_ACCESS_KEY = "xMfz6U5b64iqAwoAsWGY0"; 

console.log("🚀 Initializing bulk-import-dataset function v13 (Final)");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const legiscanApiKey = Deno.env.get("LEGISCAN_API_KEY");
    if (!legiscanApiKey) throw new Error("LEGISCAN_API_KEY is not set.");

    const legiscanUrl = `https://api.legiscan.com/?op=getDataset&id=${SESSION_ID}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
    
    console.log(`Fetching dataset for session ${SESSION_ID}...`);
    
    const legiscanResponse = await fetch(legiscanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    if (!legiscanResponse.ok) throw new Error(`LegiScan API request failed`);

    const legiscanJson = await legiscanResponse.json();
    const { dataset } = legiscanJson;
    if (!dataset?.zip) throw new Error("No 'dataset.zip' property found.");
    
    console.log("✅ Dataset received! Unzipping...");
    const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const zip = new JSZip();
    await zip.loadAsync(dataset.zip, { base64: true });
    
    const processingPromises = [];

    // **THE FIX:** The file path check now looks for files that END with '/bill/[filename].json'
    for (const file of Object.values(zip.files)) {
        if (file.name.includes('/bill/') && !file.dir) {
            const promise = file.async("text").then(billJsonText => {
                const billJson = JSON.parse(billJsonText);
                const billData = billJson.bill;
                return {
                    id: billData.bill_id,
                    bill_number: billData.bill_number,
                    title: billData.title,
                    description: billData.description,
                    status: String(billData.status),
                    state_link: billData.state_link,
                    change_hash: billData.change_hash,
                    summary_simple: `Placeholder for ${billData.bill_number}.`,
                    summary_medium: `Placeholder for ${billData.bill_number}.`,
                    summary_complex: `Placeholder for ${billData.bill_number}.`,
                };
            }).catch(e => {
                console.error(`Skipping malformed file: ${file.name}`, e);
                return null;
            });
            processingPromises.push(promise);
        }
    }
    
    const billsToUpsert = (await Promise.all(processingPromises)).filter(Boolean);
    console.log(`✅ Processed ${billsToUpsert.length} bills, ready for import.`);

    if (billsToUpsert.length === 0) {
      throw new Error("No bill files were found in the dataset's 'bill' directory.");
    }

    const CHUNK_SIZE = 500;
    for (let i = 0; i < billsToUpsert.length; i += CHUNK_SIZE) {
      const chunk = billsToUpsert.slice(i, i + CHUNK_SIZE);
      console.log(`Importing chunk ${Math.floor(i / CHUNK_SIZE) + 1} of ${Math.ceil(billsToUpsert.length / CHUNK_SIZE)}...`);
      const { error: upsertError } = await supabaseAdmin
        .from("bills")
        .upsert(chunk, { onConflict: "id" });
      if (upsertError) throw upsertError;
    }

    console.log("✅🎉 VICTORY! Successfully imported all bills!");

    return new Response(JSON.stringify({ message: `Successfully imported ${billsToUpsert.length} bills.` }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Function failed:", error);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

// This function is designed to be run in a Deno environment with the necessary permissions to access environment variables and make network requests.
// Ensure you have the required environment variables set before running this function:
// - LEGISCAN_API_KEY
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY