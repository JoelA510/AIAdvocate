// supabase/functions/sync-updated-bills/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SESSION_ID = 2172; // Using the US Congress session we know works
const DATASET_ACCESS_KEY = "xMfz6U5b64iqAwoAsWGY0";

console.log(" Initializing sync-updated-bills function");

serve(async (_req) => {
  try {
    const legiscanApiKey = Deno.env.get("LEGISCAN_API_KEY");
    if (!legiscanApiKey) throw new Error("LEGISCAN_API_KEY is not set.");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Get the lightweight master list from LegiScan
    const masterListUrl = `https://api.legiscan.com/?op=getMasterListRaw&id=${SESSION_ID}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
    console.log("Fetching master list from LegiScan...");
    const masterListResponse = await fetch(masterListUrl);
    if (!masterListResponse.ok) throw new Error("Failed to fetch master list from LegiScan.");
    
    const { masterlist } = await masterListResponse.json();
    if (!masterlist) throw new Error("Master list not found in API response.");
    
    const legiscanBills = Object.values(masterlist);
    console.log(`Received ${legiscanBills.length} bills in the master list.`);

    // 2. Get our current bill IDs and hashes from our database
    const { data: ourBills, error: dbError } = await supabaseAdmin
      .from("bills")
      .select("id, change_hash");
    if (dbError) throw dbError;

    // Create a Map for efficient lookups (ID -> hash)
    const ourBillsMap = new Map(ourBills.map(b => [b.id, b.change_hash]));
    console.log(`Found ${ourBillsMap.size} bills in our local database.`);

    // 3. Compare lists to find bills that are new or updated
    const billsToFetchIds = [];
    for (const legiscanBill of legiscanBills) {
      const ourBillHash = ourBillsMap.get(legiscanBill.bill_id);
      if (!ourBillHash || ourBillHash !== legiscanBill.change_hash) {
        billsToFetchIds.push(legiscanBill.bill_id);
      }
    }

    if (billsToFetchIds.length === 0) {
      const message = "Sync complete. No new or updated bills found.";
      console.log(message);
      return new Response(JSON.stringify({ message }), { headers: corsHeaders });
    }

    console.log(`Found ${billsToFetchIds.length} bills that need to be fetched.`);

    // 4. Fetch the full details for ONLY the bills that have changed
    const fetchPromises = billsToFetchIds.map(billId => {
      const billUrl = `https://api.legiscan.com/?op=getBill&id=${billId}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
      return fetch(billUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      }).then(res => res.json());
    });
    
    const fetchedBillResults = await Promise.all(fetchPromises);
    console.log(`Successfully fetched details for ${fetchedBillResults.length} bills.`);

    // 5. Map the results to our database schema and upsert them
    const billsToUpsert = fetchedBillResults.map(result => {
      const billData = result.bill;
      return {
        id: billData.bill_id,
        bill_number: billData.bill_number,
        title: billData.title,
        description: billData.description,
        status: String(billData.status),
        state_link: billData.state_link,
        change_hash: billData.change_hash,
      };
    });

    const { error: upsertError } = await supabaseAdmin
      .from("bills")
      .upsert(billsToUpsert, { onConflict: "id" });

    if (upsertError) throw upsertError;

    const successMessage = `✅ Sync complete! Successfully upserted ${billsToUpsert.length} bills.`;
    console.log(successMessage);
    return new Response(JSON.stringify({ message: successMessage }), { headers: corsHeaders });

  } catch (error) {
    console.error("Function failed:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});