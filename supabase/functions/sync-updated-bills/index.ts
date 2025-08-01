// supabase/functions/sync-updated-bills/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SESSION_ID = 2172;
const DATASET_ACCESS_KEY = "xMfz6U5b64iqAwoAsWGY0";
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

console.log("🚀 Initializing sync-updated-bills v16 (Final with UTF-8)");

serve(async (req) => {
  if (req.method === "GET") {
    return new Response(JSON.stringify({ message: "Function is alive" }), { headers: corsHeaders });
  }
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const legiscanApiKey = Deno.env.get("LEGISCAN_API_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!legiscanApiKey || !geminiApiKey) throw new Error("API keys are not set.");
    
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

    const getSummary = async (prompt, text) => {
      try {
        const fullPrompt = `${prompt}\n\n---\n\n${text}`;
        const result = await model.generateContent(fullPrompt);
        return result.response.text();
      } catch (e) {
        console.error(`Gemini API call failed: ${e.message}`);
        return `AI_SUMMARY_FAILED: ${e.message}`;
      }
    };

    const { bill_id: requestedBillId } = (await req.json()) || {};
    let billToProcessId;

    if (requestedBillId) {
      billToProcessId = requestedBillId;
    } else {
      const { data: billToProcess, error: findBillError } = await supabaseAdmin
        .from("bills").select("id").or('summary_simple.ilike.Placeholder for%,summary_simple.ilike.AI_SUMMARY_FAILED%').limit(1).single();
      
      if (findBillError) {
        if (findBillError.code === 'PGRST116') {
          return new Response(JSON.stringify({ message: "Sync complete. All bills are up-to-date." }), { headers: corsHeaders });
        }
        throw findBillError;
      }
      billToProcessId = billToProcess.id;
    }
    
    console.log(`Processing bill ID: ${billToProcessId}...`);
    
    const billDetailsUrl = `https://api.legiscan.com/?op=getBill&id=${billToProcessId}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
    const billDetailsRes = await fetch(billDetailsUrl, { headers: BROWSER_HEADERS });
    const { bill: billData } = await billDetailsRes.json();
    
    const doc = billData.texts && billData.texts.length > 0 ? billData.texts[billData.texts.length - 1] : null;
    if (!doc || !doc.doc_id) {
      await supabaseAdmin.from("bills").upsert({ id: billToProcessId, summary_simple: "No text available." });
      return new Response(JSON.stringify({ message: `Skipped bill ${billToProcessId} (no text).` }), { headers: corsHeaders });
    }

    const billTextUrl = `https://api.legiscan.com/?op=getBillText&id=${doc.doc_id}&key=${legiscanApiKey}&access_key=${DATASET_ACCESS_KEY}`;
    const billTextRes = await fetch(billTextUrl, { headers: BROWSER_HEADERS });
    const { text: textData } = await billTextRes.json();
    
    const binaryString = atob(textData.doc);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    const decoder = new TextDecoder('utf-8');
    const rawHtml = decoder.decode(bytes);
    
    let originalText = rawHtml;
    if (rawHtml.trim().startsWith('<')) {
        const dom = new DOMParser().parseFromString(rawHtml, "text/html");
        originalText = dom?.body.textContent?.trim() ?? '';
    }

    console.log(`- Generating summaries for ${billData.bill_number}...`);
    const [summarySimple, summaryMedium, summaryComplex] = await Promise.all([
        getSummary("Explain and summarize this legislative bill to a 12 year old. Be as verbose as needed not to miss a detail.", originalText),
        getSummary("Explain and summarize this legislative bill to a 16 year old. Be as verbose as needed not to miss a detail.", originalText),
        getSummary("Explain and summarize this legislative bill to a policy expert in plain language. Be as verbose as needed not to miss a detail.", originalText)
    ]);
      
    const billToUpsert = {
        id: billData.bill_id, bill_number: billData.bill_number, title: billData.title,
        description: billData.description, status: String(billData.status),
        state_link: billData.state_link, change_hash: billData.change_hash,
        original_text: originalText, summary_simple: summarySimple,
        summary_medium: summaryMedium, summary_complex: summaryComplex,
    };

    await supabaseAdmin.from("bills").upsert(billToUpsert, { onConflict: "id" });
    
    const successMessage = `✅ Successfully processed bill ${billData.bill_number}.`;
    return new Response(JSON.stringify({ message: successMessage }), { headers: corsHeaders });

  } catch (error) {
    console.error("Function failed:", error);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 500, headers: corsHeaders
    });
  }
});