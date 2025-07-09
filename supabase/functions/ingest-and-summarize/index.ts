import { createClient } from "@supabase/supabase-js";
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { MOCK_BILL_DATA, MOCK_SUMMARIES } from "../_shared/mock-data.ts";

console.log(`🚀 Function 'ingest-and-summarize' up and running!`);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { billId } = await req.json();
    if (!billId) throw new Error("Missing 'billId'");

    console.log("--- MOCK MODE ENABLED ---");
    const billData = MOCK_BILL_DATA;
    const summaries = MOCK_SUMMARIES;
    console.log(`✅ Using mock bill data for bill #${billId}`);
    
    const { data: savedBill, error: dbError } = await supabaseAdmin
      .from("bills")
      .upsert({
        id: billData.bill_id,
        bill_number: billData.bill_number,
        title: billData.title,
        description: billData.description,
        status: String(billData.status),
        state_link: billData.state_link,
        summary_simple: summaries.summary_simple,
        summary_medium: summaries.summary_medium,
        summary_complex: summaries.summary_complex,
      })
      .select()
      .single();
      
    if (dbError) throw dbError;
    console.log(`✅ Successfully saved bill to database!`);
    
    return new Response(JSON.stringify(savedBill), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});