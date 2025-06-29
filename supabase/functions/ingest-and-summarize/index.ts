import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

console.log(`🚀 Function 'ingest-and-summarize' up and running!`)

// This is a serverless function that processes bills from LegiScan,
// summarizes them using OpenAI, and prepares the data for storage.
// It listens for a request, does its job, and sends back a response.
Deno.serve(async (req) => {
  // This part handles CORS requirements.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // === PART 1: GETTING THE SECRET KEYS ===
    const legiscanApiKey = Deno.env.get('LEGISCAN_API_KEY')
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')

    // Read the "work order" to see which bill to process.
    const { billId } = await req.json()
    if (!billId) {
      throw new Error("Missing parameter: 'billId' is required.")
    }

    // === PART 2: CALLING LEGISCAN ===
    console.log(`Fetching bill #${billId} from LegiScan...`)
    const legiscanUrl = `https://api.legiscan.com/?key=${legiscanApiKey}&op=getBill&id=${billId}`
    const legiscanResponse = await fetch(legiscanUrl)
    if (!legiscanResponse.ok) {
      throw new Error(`LegiScan API failed with status: ${legiscanResponse.status}`)
    }
    const legiscanPayload = await legiscanResponse.json()
    const billData = legiscanPayload.bill;
    // For now, just grabbing the main description.
    const textToSummarize = billData.description; 
    console.log(`✅ Got bill data: "${billData.title}"`)


    // === PART 3: CALLING OPENAI ===
    console.log(`Sending text to OpenAI for summarization...`)
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are an expert at summarizing legal documents for a general audience. Your output must be a valid JSON object with three specific keys: 'summary_simple', 'summary_medium', and 'summary_complex'."
          },
          {
            role: "user",
            content: `Please summarize the following bill text:\n\n---\n\n${textToSummarize}`
          }
        ],
        response_format: { type: "json_object" }
      }),
    })

    if (!openaiResponse.ok) {
      throw new Error(`OpenAI API failed with status: ${openaiResponse.status}`)
    }
    const openaiPayload = await openaiResponse.json()
    // Parser for the summary, which should be a JSON string.
    const summaries = JSON.parse(openaiPayload.choices[0].message.content);
    console.log(`✅ Got summaries from OpenAI.`)


    // === PART 4: REPORTING BACK ===
    // This is only a result report for now.
    // This will NOT save anything to the database yet. That's the next step.
    const finalResult = {
      sourceData: {
        id: billData.bill_id,
        title: billData.title,
        bill_number: billData.bill_number,
        description: billData.description
      },
      generatedSummaries: summaries
    }

    return new Response(JSON.stringify(finalResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })

  } catch (error) {
    // Error Reporter.
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})