// supabase/functions/sync-updated-bills/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { GoogleGenerativeAI } from "npm:@google/generative-ai";
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
};

console.log("🚀 Initializing sync-updated-bills v19 (Professional Prompts)");

function cleanText(rawText: string): string {
    if (!rawText) return '';
    let cleanedText = rawText;
    if (cleanedText.trim().startsWith('<')) {
        try {
            const dom = new DOMParser().parseFromString(cleanedText, "text/html");
            cleanedText = dom?.body.textContent ?? '';
        } catch (e) { console.error("DOMParser failed, falling back to raw text.", e); }
    }
    cleanedText = cleanedText.replace(/ /g, ' ').replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"').replace(/'/g, "'");
    cleanedText = cleanedText.replace(/Â/g, '').replace(/\uFFFD/g, '');
    cleanedText = cleanedText.replace(/\s\s+/g, ' ').trim();
    return cleanedText;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    // --- NEW: Professional, objective prompts ---
    const PROMPT_SIMPLE = "Create a simple, professional summary of the following legislative text, suitable for a 5th-grade reading level. The summary must be objective and avoid any conversational or personable language. Explain the key points of the bill clearly.";
    const PROMPT_MEDIUM = "Create a professional summary of the following legislative text, suitable for a 10th-grade reading level. The summary must be objective, fact-based, and avoid conversational language. Detail the main provisions, changes to existing law, and the overall purpose of the bill.";
    const PROMPT_COMPLEX = "Create a comprehensive, professional summary of the following legislative text for a policy expert, written in clear and accessible language. The summary must be objective and fact-based. Detail the specific legal changes, the context or problem the bill addresses, and its potential implications without using jargon where simpler terms suffice.";

    const { data: billToProcess, error: findBillError } = await supabaseAdmin
        .from("bills").select("id").or('summary_simple.ilike.Placeholder for%,summary_simple.ilike.AI_SUMMARY_FAILED%').limit(1).single();

    if (findBillError) {
        if (findBillError.code === 'PGRST116') {
            return new Response(JSON.stringify({ message: "Sync complete. All bills are up-to-date." }), { headers: corsHeaders });
        }
        throw findBillError;
    }

    const billToProcessId = billToProcess.id;
    console.log(`Processing bill ID: ${billToProcessId}...`);

    const billDetailsUrl = `https://api.legiscan.com/?op=getBill&id=${billToProcessId}&key=${legiscanApiKey}`;
    const billDetailsRes = await fetch(billDetailsUrl, { headers: BROWSER_HEADERS });
    const { bill: billData } = await billDetailsRes.json();

    let rawTextForCleaning;
    const latestTextDoc = billData.texts && billData.texts.length > 0 ? billData.texts[billData.texts.length - 1] : null;

    if (latestTextDoc?.doc_id) {
        const billTextUrl = `https://api.legiscan.com/?op=getBillText&id=${latestTextDoc.doc_id}&key=${legiscanApiKey}`;
        const billTextRes = await fetch(billTextUrl, { headers: BROWSER_HEADERS });
        const { text: textData } = await billTextRes.json();
        const binaryString = atob(textData.doc);
        const bytes = Uint8Array.from(binaryString, c => c.charCodeAt(0));
        const decoder = new TextDecoder('utf-8', { fatal: false });
        rawTextForCleaning = decoder.decode(bytes);
    } else {
        // If there's truly no text, use the title as a last resort.
        console.log(`- Bill ${billData.bill_number} has no text document. Using title for summarization.`);
        rawTextForCleaning = billData.title;
    }

    const originalText = cleanText(rawTextForCleaning);

    if (!originalText) {
        await supabaseAdmin.from("bills").upsert({ id: billToProcessId, summary_simple: "No text available.", summary_medium: "No text available.", summary_complex: "No text available." });
        return new Response(JSON.stringify({ message: `Skipped bill ${billToProcessId} (no text found).` }), { headers: corsHeaders });
    }

    console.log(`- Generating professional summaries for ${billData.bill_number}...`);
    const [summarySimple, summaryMedium, summaryComplex] = await Promise.all([
        getSummary(PROMPT_SIMPLE, originalText),
        getSummary(PROMPT_MEDIUM, originalText),
        getSummary(PROMPT_COMPLEX, originalText)
    ]);

    const billToUpsert = {
        id: billData.bill_id, bill_number: billData.bill_number, title: billData.title,
        description: billData.description, status: String(billData.status),
        state_link: billData.state_link, change_hash: billData.change_hash,
        original_text: originalText, summary_simple: summarySimple,
        summary_medium: summaryMedium, summary_complex: summaryComplex,
    };

    await supabaseAdmin.from("bills").upsert(billToUpsert, { onConflict: "id" });

    const successMessage = `✅ Successfully processed and cleaned bill ${billData.bill_number}.`;
    return new Response(JSON.stringify({ message: successMessage }), { headers: corsHeaders });

  } catch (error) {
    console.error("Function failed:", error);
    return new Response(JSON.stringify({ error: error.message, stack: error.stack }), {
      status: 500, headers: corsHeaders
    });
  }
});