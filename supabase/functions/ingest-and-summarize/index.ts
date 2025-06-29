import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
// NEW: Import our fake data
import { MOCK_BILL_DATA, MOCK_SUMMARIES } from '../_shared/mock-data.ts'

console.log(`🚀 Function 'ingest-and-summarize' up and running!`)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // === PART 1: CONFIGURE CLIENTS AND GET PARAMETERS ===
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)
    const { billId } = await req.json()
    if (!billId) throw new Error("Missing 'billId'")

    // === MOCK DATA SECTION ===
    // We are no longer calling LegiScan or OpenAI.
    // We are just pretending by using our pre-saved fake data.
    console.log("--- MOCK MODE ENABLED ---")
    console.log(`Using mock data for bill #${billId}...`)
    const billData = MOCK_BILL_DATA;
    const summaries = MOCK_SUMMARIES;
    console.log(`✅ Got mock bill data: "${billData.title}"`)
    console.log(`✅ Got mock summaries.`)
    
    // === PART 4: SAVE DATA TO THE DATABASE ===
    // This part of the logic remains THE SAME. We are now testing
    // if our saving mechanism works correctly with the fake data.
    console.log(`Saving bill #${billId} to the database...`)
    const { data: savedBill, error: dbError } = await supabaseAdmin
      .from('bills')
      .upsert({
        id: billData.bill_id,
        bill_number: billData.bill_number,
        title: billData.title,
        description: billData.description,
        status: String(billData.status), // Convert status number to string
        state_link: billData.state_link,
        summary_simple: summaries.summary_simple,
        summary_medium: summaries.summary_medium,
        summary_complex: summaries.summary_complex
      })
      .select()
      .single()
      
    if (dbError) throw dbError;
    console.log(`✅ Successfully saved bill to database!`)
    
    // === PART 5: REPORT BACK THE SAVED DATA ===
    return new Response(JSON.stringify(savedBill), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})