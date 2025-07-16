// supabase/functions/sync-updated-bills/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SESSION_ID = 2172;
const DATASET_ACCESS_KEY = "xMfz6U5b64iqAwoAsWGY0";

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

console.log(" Initializing sync-updated-bills function v3 (Batch Processing)");

serve(async (_req) => {
  try {
    const legiscanApiKey = Deno.env.get("LEGISCAN_API_KEY");
    if (!legiscanApiKey) throw new Error("LEGISCAN_API_KEY is not set.");
    
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const masterListUrl = `https://api.legiscan.com/?op=getMasterListRaw&id=${SESSION_ID}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
    console.log("Fetching master list from LegiScan...");
    const masterListResponse = await fetch(masterListUrl, { headers: BROWSER_HEADERS });
    if (!masterListResponse.ok) throw new Error(`Failed to fetch master list. Status: ${masterListResponse.status}`);
    
    const { masterlist } = await masterListResponse.json();
    if (!masterlist) throw new Error("Master list not found in API response.");
    
    const legiscanBills = Object.values(masterlist);
    const { data: ourBills } = await supabaseAdmin.from("bills").select("id, change_hash");
    const ourBillsMap = new Map(ourBills.map(b => [b.id, b.change_hash]));
    
    const billsToFetchIds = [];
    for (const legiscanBill of legiscanBills) {
      if (ourBillsMap.get(legiscanBill.bill_id) !== legiscanBill.change_hash) {
        billsToFetchIds.push(legiscanBill.bill_id);
      }
    }

    if (billsToFetchIds.length === 0) {
      return new Response(JSON.stringify({ message: "Sync complete. No new or updated bills found." }), { headers: corsHeaders });
    }

    console.log(`Found ${billsToFetchIds.length} bills to update. Fetching details in batches...`);

    // **THE FIX:** Process requests in sequential batches instead of all at once.
    const BATCH_SIZE = 20;
    let allFetchedBills = [];

    for (let i = 0; i < billsToFetchIds.length; i += BATCH_SIZE) {
        const batchIds = billsToFetchIds.slice(i, i + BATCH_SIZE);
        console.log(`Fetching batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(billsToFetchIds.length / BATCH_SIZE)}...`);
        
        const batchPromises = batchIds.map(billId => {
            const billUrl = `https://api.legiscan.com/?op=getBill&id=${billId}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
            return fetch(billUrl, { headers: BROWSER_HEADERS }).then(res => res.json());
        });
        
        const batchResults = await Promise.all(batchPromises);
        allFetchedBills.push(...batchResults);
        
        // Optional: Add a small delay between batches to be even gentler on the API.
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
    }

    console.log(`Successfully fetched details for ${allFetchedBills.length} bills.`);

    const billsToUpsert = allFetchedBills.map(result => {
      const billData = result.bill;
      return {
        id: billData.bill_id, bill_number: billData.bill_number, title: billData.title,
        description: billData.description, status: String(billData.status),
        state_link: billData.state_link, change_hash: billData.change_hash,
      };
    }).filter(Boolean); // Filter out any potential nulls if a fetch failed

    if (billsToUpsert.length > 0) {
        const { error: upsertError } = await supabaseAdmin.from("bills").upsert(billsToUpsert, { onConflict: "id" });
        if (upsertError) throw upsertError;
    }

    const successMessage = `✅ Sync complete! Successfully fetched and upserted ${billsToUpsert.length} bills.`;
    console.log(successMessage);
    return new Response(JSON.stringify({ message: successMessage }), { headers: corsHeaders });

  } catch (error) {
    console.error("Function failed:", error);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});