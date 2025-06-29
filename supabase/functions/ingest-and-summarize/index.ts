import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`🚀 Function 'ingest-and-summarize' up and running!`)

// This is a serverless function that processes bills from LegiScan,
// summarizes them using OpenAI, and saves the final data to the database.
// It listens for a request, does its job, and sends back a response.
Deno.serve(async (req) => {
  // This part handles CORS preflight requests.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // === PART 1: CONFIGURE CLIENTS AND GET PARAMETERS ===
    // Obtain the secret keys from the function's environment variables.
    const legiscanApiKey = Deno.env.get('LEGISCAN_API_KEY')!
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    
    // Create a Supabase admin client with permission to write to the database.
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

    // Read the billId from the incoming request body to see which bill to process.
    const { billId } = await req.json()
    if (!billId) {
      throw new Error("Missing parameter: 'billId' is required.")
    }

    // === PART 2: FETCH DATA FROM LEGISCAN ===
    console.log(`Fetching bill #${billId} from LegiScan...`)
    const legiscanUrl = `https://api.legiscan.com/?key=${legiscanApiKey}&op=getBill&id=${billId}`
    const legiscanResponse = await fetch(legiscanUrl)
    if (!legiscanResponse.ok) throw new Error(`LegiScan API failed: ${legiscanResponse.status}`)
    
    const legiscanPayload = await legiscanResponse.json()
    const billData = legiscanPayload.bill
    const textToSummarize = billData.description // Using the description field for summarization.
    console.log(`✅ Got bill data: "${billData.title}"`)

    // === PART 3: GENERATE SUMMARIES WITH OPENAI ===
    console.log(`Sending text to OpenAI for summarization...`)
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${openaiApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are an expert at summarizing legal documents for a general audience. Your output must be a valid JSON object with three specific keys: 'summary_simple', 'summary_medium', and 'summary_complex'." },
          { role: "user", content: `Please summarize the following bill text:\n\n---\n\n${textToSummarize}` }
        ],
        response_format: { type: "json_object" }
      }),
    })
    if (!openaiResponse.ok) throw new Error(`OpenAI API failed: ${openaiResponse.status}`)

    const openaiPayload = await openaiResponse.json()
    const summaries = JSON.parse(openaiPayload.choices[0].message.content); // The AI returns a JSON string, which must be parsed.
    console.log(`✅ Got summaries from OpenAI.`)

    // === PART 4: SAVE DATA TO THE DATABASE ===
    console.log(`Saving bill #${billId} to the database...`)
    // The 'upsert' command efficiently creates a new bill or updates an existing one.
    const { data: savedBill, error: dbError } = await supabaseAdmin
      .from('bills')
      .upsert({
        id: billData.bill_id,
        bill_number: billData.bill_number,
        title: billData.title,
        description: billData.description,
        status: billData.status,
        state_link: billData.state_link,
        summary_simple: summaries.summary_simple,
        summary_medium: summaries.summary_medium,
        summary_complex: summaries.summary_complex
      })
      .select()
      .single() // Expect a single row to be returned after the operation.
      
    if (dbError) throw dbError; // If the database save fails, stop and throw an error.
    console.log(`✅ Successfully saved bill to database!`)
    

    // === PART 5: REPORT BACK THE SAVED DATA ===
    // The function returns the final data that was actually saved to the database.
    return new Response(JSON.stringify(savedBill), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    // Catch and report any errors that occurred during the process.
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500, // Use 500 for a general server-side error
    })
  }
})