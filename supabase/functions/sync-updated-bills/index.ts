// supabase/functions/sync-updated-bills/index.ts
// VERSION 3.0: Bilingual summaries, batching, and embedding updates

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

// --- Configuration ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
};

const MAX_BILLS_PER_RUN = Number(Deno.env.get("SYNC_BILLS_PER_RUN") ?? "3");

console.log("🚀 Initializing sync-updated-bills v3.0 (Bilingual summaries + batching)");

const cleanText = (rawText: string): string => {
  if (!rawText) return "";
  let cleanedText = rawText;
  if (cleanedText.trim().startsWith("<")) {
    try {
      const dom = new DOMParser().parseFromString(cleanedText, "text/html");
      cleanedText = dom?.body.textContent ?? "";
    } catch (e) {
      console.error("DOMParser failed, falling back to raw text cleaning.", e);
    }
  }
  cleanedText = cleanedText
    .replace(/ /g, " ")
    .replace(/Â/g, "")
    .replace(/\uFFFD/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t+/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleanedText;
};

const toAscii = (input: string): string =>
  input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2022\u25CF]/g, "*")
    .replace(/[^\x00-\x7F]+/g, " ")
    .replace(/\s\s+/g, " ")
    .trim();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const legiscanApiKey = Deno.env.get("LEGISCAN_API_KEY");
    const openAiKey = Deno.env.get("OpenAI_GPT_Key");
    if (!legiscanApiKey || !openAiKey) {
      throw new Error("API keys (LEGISCAN_API_KEY, OpenAI_GPT_Key) are not set.");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const processedBills: number[] = [];
    const failures: Array<{ billId: number; reason: string }> = [];

    const fetchNextBillId = async (): Promise<number | null> => {
      const { data, error } = await supabaseAdmin
        .from("bills")
        .select("id")
        .or("summary_simple.ilike.Placeholder for%,summary_simple.ilike.AI_SUMMARY_FAILED%")
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data?.id ?? null;
    };

    const processBill = async (billId: number) => {
      console.log(`Processing bill ID: ${billId}...`);

      const billDetailsUrl = `https://api.legiscan.com/?op=getBill&id=${billId}&key=${legiscanApiKey}`;
      const billDetailsRes = await fetch(billDetailsUrl, { headers: BROWSER_HEADERS });
      const { bill: billData } = await billDetailsRes.json();

      let rawTextForCleaning: string | undefined;
      const latestTextDoc =
        billData.texts?.length > 0 ? billData.texts[billData.texts.length - 1] : null;

      if (latestTextDoc?.doc_id) {
        const billTextUrl = `https://api.legiscan.com/?op=getBillText&id=${latestTextDoc.doc_id}&key=${legiscanApiKey}`;
        const billTextRes = await fetch(billTextUrl, { headers: BROWSER_HEADERS });
        const { text: textData } = await billTextRes.json();
        const binaryString = atob(textData.doc);
        const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
        const decoder = new TextDecoder("utf-8", { fatal: false });
        rawTextForCleaning = decoder.decode(bytes);
      } else {
        console.log(`- Bill ${billData.bill_number} has no text document. Using title as fallback.`);
        rawTextForCleaning = billData.title;
      }

      const originalText = cleanText(rawTextForCleaning ?? "");

      if (!originalText) {
        await supabaseAdmin
          .from("bills")
          .update({ summary_simple: "No text available." })
          .eq("id", billId);
        failures.push({ billId, reason: "No text available" });
        return;
      }

      console.log(`- Generating bilingual summaries for ${billData.bill_number}...`);
      const summaryPrompt = `
        Read the legislative content below and return a JSON object with this exact shape:
        {
          "formatted_text": "...",
          "english": {
            "simple": "...",
            "medium": "...",
            "complex": "..."
          },
          "spanish": {
            "simple": "...",
            "medium": "...",
            "complex": "..."
          }
        }

        Requirements:
        - "formatted_text" must contain the exact wording of the legislative text while improving whitespace: insert blank lines between sections, preserve numbered or bulleted items on their own lines, and avoid altering or paraphrasing the content.
        - The English summaries must use only ASCII characters (replace smart quotes, dashes, etc.).
        - "simple" explains the bill for a 5th-grade reader in at least one paragraph.
        - "medium" is a detailed 10th-grade explanation in at least two paragraphs.
        - "complex" is an expert-level summary outlining legal changes and implications.
        - Spanish summaries should be natural Latin American Spanish, maintaining diacritics.
        - Do not include any additional keys, commentary, or markdown.

        Legislative Text:
        ---
        ${originalText}
      `;

      const makeSummaryRequest = async () => {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  "You analyze legislation and return strictly valid JSON containing bilingual tiered summaries and a formatted version of the source text.",
              },
              { role: "user", content: summaryPrompt.trim() },
            ],
          }),
        });

        if (!response.ok) {
          const errorDetails = await response.text();
          throw new Error(`OpenAI chat completion failed (${response.status}): ${errorDetails}`);
        }

        const payload = await response.json();
        const content = payload?.choices?.[0]?.message?.content;
        if (!content) {
          throw new Error("OpenAI chat completion returned no summary content.");
        }

        let parsed;
        try {
          parsed = JSON.parse(content.trim());
        } catch (err) {
          throw new Error(`Failed to parse OpenAI JSON response: ${(err as Error).message}`);
        }

        return parsed;
      };

      let summaries: any;
      const MAX_ATTEMPTS = 2;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          summaries = await makeSummaryRequest();
          break;
        } catch (err) {
          if (attempt === MAX_ATTEMPTS) throw err;
          console.warn(`OpenAI summary attempt ${attempt} failed. Retrying...`, err);
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        }
      }

      if (!summaries) {
        throw new Error("OpenAI summary attempts failed without a response payload.");
      }

      const formattedText = summaries?.formatted_text;
      const englishSummaries = summaries?.english;
      const spanishSummaries = summaries?.spanish;

      if (!formattedText || typeof formattedText !== "string") {
        throw new Error("Missing formatted_text in OpenAI response.");
      }
      if (!englishSummaries?.simple || !englishSummaries?.medium || !englishSummaries?.complex) {
        throw new Error("Missing English summaries in response.");
      }
      if (!spanishSummaries?.simple || !spanishSummaries?.medium || !spanishSummaries?.complex) {
        throw new Error("Missing Spanish summaries in response.");
      }

      const formattedOriginalText = formattedText
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .trim();

      console.log(`- Generating vector embedding for ${billData.bill_number}...`);
      const textForEmbedding = [
        `Title: ${billData.title}`,
        `Description: ${billData.description}`,
        `Expert Summary: ${englishSummaries.complex}`,
      ].join("\n\n");

      const embeddingResponse = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: textForEmbedding,
        }),
      });

      if (!embeddingResponse.ok) {
        const embeddingError = await embeddingResponse.text();
        throw new Error(`OpenAI embedding request failed (${embeddingResponse.status}): ${embeddingError}`);
      }

      const embeddingPayload = await embeddingResponse.json();
      const embedding = embeddingPayload?.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error("OpenAI embedding response was missing embedding data.");
      }

      const statusText = billData.status_text ?? null;
      const statusDate = billData.status_date ?? null;
      const progress = Array.isArray(billData.progress) ? billData.progress : [];
      const calendar = Array.isArray(billData.calendar) ? billData.calendar : [];
      const history = Array.isArray(billData.history) ? billData.history : [];

      const billToUpsert = {
        id: billData.bill_id,
        bill_number: billData.bill_number,
        title: billData.title,
        description: billData.description,
        status: String(billData.status),
        status_text: statusText,
        status_date: statusDate,
        state_link: billData.state_link,
        change_hash: billData.change_hash,
        original_text: formattedOriginalText,
        summary_simple: toAscii(englishSummaries.simple),
        summary_medium: toAscii(englishSummaries.medium),
        summary_complex: toAscii(englishSummaries.complex),
        progress,
        calendar,
        history,
        embedding,
      };

      const { error: upsertError } = await supabaseAdmin
        .from("bills")
        .upsert(billToUpsert, { onConflict: "id" });
      if (upsertError) throw upsertError;

      const spanishPayload = {
        bill_id: billData.bill_id,
        language_code: "es",
        summary_simple: spanishSummaries.simple.trim(),
        summary_medium: spanishSummaries.medium.trim(),
        summary_complex: spanishSummaries.complex.trim(),
        updated_at: new Date().toISOString(),
      };

      const { error: translationError } = await supabaseAdmin
        .from("bill_translations")
        .upsert(spanishPayload, { onConflict: "bill_id,language_code" });
      if (translationError) {
        console.error("Failed to upsert Spanish summaries", translationError);
      }

      processedBills.push(billData.bill_id);
      console.log(`✅ Successfully processed bill ${billData.bill_number}.`);
    };

    for (let processed = 0; processed < Math.max(1, MAX_BILLS_PER_RUN); processed++) {
      const nextId = await fetchNextBillId();
      if (!nextId) break;

      try {
        await processBill(nextId);
      } catch (err) {
        console.error(`❌ Failed processing bill ${nextId}:`, err);
        await supabaseAdmin
          .from("bills")
          .update({ summary_simple: "AI_SUMMARY_FAILED" })
          .eq("id", nextId);
        failures.push({ billId: nextId, reason: (err as Error).message });
      }
    }

    if (processedBills.length === 0) {
      return new Response(JSON.stringify({ message: "Sync complete. All bills are up-to-date." }), {
        headers: corsHeaders,
      });
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${processedBills.length} bill(s).`,
        processedBills,
        failures,
      }),
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("Function failed:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message ?? "Unexpected error" }),
      { status: 500, headers: corsHeaders },
    );
  }
});
