// supabase/functions/sync-updated-bills/index.ts
// VERSION 3.0: Bilingual summaries, batching, and embedding updates

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

interface SummaryPayload {
  english: {
    simple: string;
    medium: string;
    complex: string;
  };
  spanish: {
    simple: string;
    medium: string;
    complex: string;
  };
}

class HttpError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

// --- Configuration ---
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
};

const toJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const constantTimeEquals = (a: string, b: string): boolean => {
  const encoder = new TextEncoder();
  const A = encoder.encode(a);
  const B = encoder.encode(b);
  if (A.length !== B.length) return false;
  let result = 0;
  for (let i = 0; i < A.length; i++) {
    result |= A[i] ^ B[i];
  }
  return result === 0;
};

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
};

const MAX_BILLS_PER_RUN = Number(Deno.env.get("SYNC_BILLS_PER_RUN") ?? "3");
const MAX_MODEL_INPUT_CHARS = 12000;
const MIN_SUMMARY_LENGTHS = {
  simple: 200,
  medium: 400,
  complex: 600,
};
const asciiGuard = /[^ -~\n]/;

console.log("🚀 Initializing sync-updated-bills v3.0 (Bilingual summaries + batching)");

const normalizeNewlines = (s: string) => s.replace(/\r\n?/g, "\n");
const collapseSpacesExceptNL = (s: string) => s.replace(/[^\S\n]+/g, " ");
const collapseNLBlocks = (s: string) => s.replace(/\n{3,}/g, "\n\n");

const sanitizeRawText = (raw: string): string =>
  normalizeNewlines(raw.replace(/\uFFFD/g, "")).replace(/Â/g, "").replace(/\u00A0/g, " ");

const formatLegislationText = (raw: string): string => {
  if (!raw) return "";
  let working = raw;
  if (working.trim().startsWith("<")) {
    try {
      const doc = new DOMParser().parseFromString(working, "text/html");
      const walk = (node: Node, acc: string[] = []): string[] => {
        if (node.nodeType === 3) acc.push((node as Text).data);
        if (node.nodeType === 1) {
          const el = node as Element;
          if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(el.tagName)) {
            return acc;
          }
          if (["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6"].includes(el.tagName)) {
            acc.push("\n\n");
          }
          if (el.tagName === "LI") acc.push("\n• ");
          if (el.tagName === "BR") acc.push("\n");
          for (const child of Array.from(el.childNodes)) {
            walk(child, acc);
          }
          if (el.tagName === "LI") acc.push("\n");
        }
        return acc;
      };
      working = walk(doc?.body ?? ({} as any)).join("");
    } catch (error) {
      console.warn("DOMParser failed, using raw text for formatting", error);
    }
  }
  const collapsed = collapseNLBlocks(
    collapseSpacesExceptNL(
      normalizeNewlines(working.replace(/\uFFFD|Â|\u00A0/g, " ")),
    ),
  );
  return collapsed.trim();
};

const toAscii = (input: string): string =>
  input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[\u2022\u25CF]/g, "*")
    .replace(/[^\x00-\x7F]+/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .trim();

const summarySchema = {
  name: "SummaryPayload",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      english: {
        type: "object",
        additionalProperties: false,
        properties: {
          simple: { type: "string" },
          medium: { type: "string" },
          complex: { type: "string" },
        },
        required: ["simple", "medium", "complex"],
      },
      spanish: {
        type: "object",
        additionalProperties: false,
        properties: {
          simple: { type: "string" },
          medium: { type: "string" },
          complex: { type: "string" },
        },
        required: ["simple", "medium", "complex"],
      },
    },
    required: ["english", "spanish"],
  },
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfter = (header: string | null): number | undefined => {
  if (!header) return undefined;
  if (/^\d+$/.test(header)) return Number(header) * 1000;
  const parsed = Date.parse(header);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.max(0, parsed - Date.now());
};

const withRetries = async <T>(
  fn: (attempt: number, signal: AbortSignal) => Promise<T>,
  attempts = 3,
): Promise<T> => {
  let backoffMs = 1000;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      return await fn(attempt, controller.signal);
    } catch (error) {
      if (attempt === attempts) throw error;
      const retryAfterMs =
        error instanceof HttpError && typeof error.retryAfterMs === "number"
          ? error.retryAfterMs
          : undefined;
      const waitMs = Number.isFinite(retryAfterMs) ? Number(retryAfterMs) : backoffMs;
      console.warn(`Retrying after ${waitMs}ms due to error:`, error);
      const jitter = Math.floor(Math.random() * 250);
      await sleep(waitMs + jitter);
      backoffMs = Math.min(backoffMs * 2, 16_000);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Retry logic exhausted without completion");
};

const callSummarizer = async (
  text: string,
  openAiKey: string,
  signal: AbortSignal,
  userIdentifier: string,
): Promise<SummaryPayload> => {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      max_tokens: 4096,
      response_format: {
        type: "json_schema",
        json_schema: { name: summarySchema.name, schema: summarySchema.schema, strict: true },
      },
      user: userIdentifier,
      messages: [
        {
          role: "system",
          content:
            "Return only valid JSON per the provided schema. Summarize legislation into English and Spanish at three complexity levels. Do not repeat the source text.",
        },
        {
          role: "user",
          content:
            `Source text:\n---\n${text}\n---\nInstructions: English summaries must be ASCII only. Simple level ≈5th grade with ≥1 paragraph. Medium ≈10th grade with ≥2 paragraphs. Complex is an expert legal analysis. Spanish should remain natural with diacritics.`,
        },
      ],
    }),
    signal,
  });

  if (!res.ok) {
    throw new HttpError(
      `openai chat ${res.status}`,
      res.status,
      parseRetryAfter(res.headers.get("retry-after")),
    );
  }

  const payload = await res.json();
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Empty content from OpenAI summarizer");
  }
  try {
    return JSON.parse(content) as SummaryPayload;
  } catch (error) {
    throw new Error(`Invalid JSON from OpenAI summarizer: ${(error as Error).message}`);
  }
};

const callEmbedding = async (
  input: string,
  openAiKey: string,
  signal: AbortSignal,
): Promise<number[]> => {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input,
    }),
    signal,
  });

  if (!res.ok) {
    throw new HttpError(
      `openai embedding ${res.status}`,
      res.status,
      parseRetryAfter(res.headers.get("retry-after")),
    );
  }

  const payload = await res.json();
  const embedding = payload?.data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error("Embedding payload missing embedding array");
  }
  if (embedding.length !== 1536) {
    throw new Error(`Embedding dimension mismatch: expected 1536, received ${embedding.length}`);
  }
  return embedding as number[];
};

const toHex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

const sha256 = async (input: string): Promise<string> => {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(hash);
};

const buildSummarizerSource = (
  billData: Record<string, any>,
  formattedText: string,
): string => {
  const sections: string[] = [];
  if (billData?.title) {
    sections.push(`Title: ${billData.title}`);
  }
  if (billData?.description) {
    sections.push(`Description: ${billData.description}`);
  }
  if (billData?.summary) {
    sections.push(`LegiScan Summary: ${billData.summary}`);
  }
  if (billData?.synopsis) {
    sections.push(`Synopsis: ${billData.synopsis}`);
  }
  sections.push(`Legislation:\n${formattedText}`);
  const combined = sections.join("\n\n").trim();
  if (combined.length <= MAX_MODEL_INPUT_CHARS) return combined;
  return `${combined.slice(0, MAX_MODEL_INPUT_CHARS)}\n\n[Text truncated for model input. Focus on the salient sections above.]`;
};

const reuseEmbedding = (value: unknown): string | null => {
  if (Array.isArray(value)) return `[${value.join(",")}]`;
  if (typeof value === "string") return value;
  return null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const AUTH = Deno.env.get("SYNC_SECRET") ?? "";
  const supplied = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (req.method !== "POST") {
    return toJson({ error: "Method Not Allowed" }, 405);
  }
  if (!AUTH || !constantTimeEquals(supplied, AUTH)) {
    return toJson({ error: "Unauthorized" }, 401);
  }

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

    const owner = (crypto as any).randomUUID?.() ?? String(Date.now());

    const processedBills: number[] = [];
    const failures: Array<{ billId: number; reason: string }> = [];

    const leaseNextBillId = async (): Promise<number | null> => {
      const { data, error } = await supabaseAdmin.rpc<number>("lease_next_bill", {
        p_owner: owner,
        p_ttl_seconds: 900,
      });
      if (error) throw error;
      if (data === null || data === undefined) return null;
      const id = typeof data === "number" ? data : Number(data);
      return Number.isFinite(id) ? id : null;
    };

    const processBill = async (billId: number) => {
      console.log(`Processing bill ID: ${billId}...`);

      const { data: existingBillMeta, error: existingBillError } = await supabaseAdmin
        .from("bills")
        .select("summary_hash, embedding")
        .eq("id", billId)
        .maybeSingle();
      if (existingBillError) throw existingBillError;

      const billDetailsUrl = `https://api.legiscan.com/?op=getBill&id=${billId}&key=${legiscanApiKey}`;
      const billDetailsRes = await fetch(billDetailsUrl, { headers: BROWSER_HEADERS });
      const { bill: billData } = await billDetailsRes.json();

      let decodedText: string | undefined;
      const latestTextDoc =
        billData.texts?.length > 0 ? billData.texts[billData.texts.length - 1] : null;

      if (latestTextDoc?.doc_id) {
        const billTextUrl = `https://api.legiscan.com/?op=getBillText&id=${latestTextDoc.doc_id}&key=${legiscanApiKey}`;
        const billTextRes = await fetch(billTextUrl, { headers: BROWSER_HEADERS });
        const { text: textData } = await billTextRes.json();
        const binaryString = atob(textData.doc);
        const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
        const decoder = new TextDecoder("utf-8", { fatal: false });
        decodedText = decoder.decode(bytes);
      } else {
        console.log(`- Bill ${billData.bill_number} has no text document. Using title as fallback.`);
        decodedText = billData.title;
      }

      const originalTextRaw = sanitizeRawText(decodedText ?? "");
      if (!originalTextRaw.trim()) {
        failures.push({ billId, reason: "No text available" });
        return;
      }

      const originalTextFormatted = formatLegislationText(originalTextRaw);
      if (!originalTextFormatted) {
        failures.push({ billId, reason: "Formatter returned empty text" });
        return;
      }

      console.log(`- Generating bilingual summaries for ${billData.bill_number}...`);
      const summarizerSource = buildSummarizerSource(billData, originalTextFormatted);

      const summaries = await withRetries((_, signal) =>
        callSummarizer(
          summarizerSource,
          openAiKey,
          signal,
          String(billData?.bill_id ?? billId ?? "unknown"),
        )
      );

      const englishSummaries = summaries.english;
      const spanishSummaries = summaries.spanish;

      if (!englishSummaries?.simple || !englishSummaries?.medium || !englishSummaries?.complex) {
        throw new Error("Incomplete English summaries returned");
      }
      if (!spanishSummaries?.simple || !spanishSummaries?.medium || !spanishSummaries?.complex) {
        throw new Error("Incomplete Spanish summaries returned");
      }

      const asciiEnglish = {
        simple: toAscii(englishSummaries.simple),
        medium: toAscii(englishSummaries.medium),
        complex: toAscii(englishSummaries.complex),
      };

      if (Object.values(asciiEnglish).some((text) => !text)) {
        throw new Error("Empty English summaries after ASCII normalization");
      }

      if (Object.values(asciiEnglish).some((text) => asciiGuard.test(text))) {
        throw new Error("English summaries contain non-ASCII characters");
      }

      if (asciiEnglish.simple.length < MIN_SUMMARY_LENGTHS.simple) {
        throw new Error(`Simple summary below minimum length (${asciiEnglish.simple.length})`);
      }
      if (asciiEnglish.medium.length < MIN_SUMMARY_LENGTHS.medium) {
        throw new Error(`Medium summary below minimum length (${asciiEnglish.medium.length})`);
      }
      if (asciiEnglish.complex.length < MIN_SUMMARY_LENGTHS.complex) {
        throw new Error(`Complex summary below minimum length (${asciiEnglish.complex.length})`);
      }

      const spanishTrimmed = {
        simple: spanishSummaries.simple.trim(),
        medium: spanishSummaries.medium.trim(),
        complex: spanishSummaries.complex.trim(),
      };

      if (Object.values(spanishTrimmed).some((text) => !text)) {
        throw new Error("Spanish summaries contain empty values after trim");
      }

      const summaryHash = await sha256(asciiEnglish.complex);
      const summaryLenSimple = asciiEnglish.simple.length;

      const existingSummaryHash = existingBillMeta?.summary_hash ?? null;
      const existingEmbeddingValue = existingBillMeta?.embedding ?? null;
      const summaryHashUnchanged = existingSummaryHash !== null && existingSummaryHash === summaryHash;
      const existingEmbeddingSerialized = reuseEmbedding(existingEmbeddingValue);

      let embeddingPayload: string | null = null;

      if (summaryHashUnchanged) {
        if (existingEmbeddingSerialized) {
          console.log(`- Reusing existing embedding for ${billData.bill_number}`);
        } else {
          console.warn(
            `- Existing embedding missing for ${billData.bill_number} despite matching summary hash. Regenerating...`,
          );
        }
      }

      if (!summaryHashUnchanged || !existingEmbeddingSerialized) {
        console.log(`- Generating vector embedding for ${billData.bill_number}...`);
        const textForEmbedding = [
          `Title: ${billData.title}`,
          billData.description ? `Description: ${billData.description}` : null,
          `Expert Summary: ${asciiEnglish.complex}`,
        ]
          .filter((segment): segment is string => Boolean(segment))
          .join("\n\n");

        const embedding = await withRetries((_, signal) =>
          callEmbedding(textForEmbedding, openAiKey, signal)
        );

        embeddingPayload = `[${embedding.join(",")}]`;
      }

      const statusText = billData.status_text ?? null;
      const statusDate = billData.status_date ?? null;
      const progress = Array.isArray(billData.progress) ? billData.progress : [];
      const calendar = Array.isArray(billData.calendar) ? billData.calendar : [];
      const history = Array.isArray(billData.history) ? billData.history : [];

      const billPayload: Record<string, unknown> = {
        id: billData.bill_id,
        bill_number: billData.bill_number,
        title: billData.title,
        description: billData.description,
        status: billData.status !== undefined ? String(billData.status) : null,
        status_text: statusText,
        status_date: statusDate,
        state_link: billData.state_link,
        change_hash: billData.change_hash,
        original_text: originalTextRaw,
        original_text_formatted: originalTextFormatted,
        summary_simple: asciiEnglish.simple,
        summary_medium: asciiEnglish.medium,
        summary_complex: asciiEnglish.complex,
        summary_ok: true,
        summary_len_simple: summaryLenSimple,
        summary_hash: summaryHash,
        progress,
        calendar,
        history,
      };

      if (embeddingPayload !== null) {
        billPayload.embedding = embeddingPayload;
      }

      const spanishPayload = {
        bill_id: billData.bill_id,
        language_code: "es",
        summary_simple: spanishTrimmed.simple,
        summary_medium: spanishTrimmed.medium,
        summary_complex: spanishTrimmed.complex,
        updated_at: new Date().toISOString(),
      };

      const { error: rpcError } = await supabaseAdmin.rpc(
        "upsert_bill_and_translation",
        { bill: billPayload, tr: spanishPayload },
      );
      if (rpcError) throw rpcError;

      console.log(
        `- Summary checks for bill ${billData.bill_number}: raw_len=${originalTextRaw.length}, formatted_len=${originalTextFormatted.length}, summary_ok=true`,
      );

      processedBills.push(billData.bill_id);
      console.log(`✅ Successfully processed bill ${billData.bill_number}.`);
    };

    const maxBillsToProcess = Math.max(0, Number(MAX_BILLS_PER_RUN) || 0);
    for (let i = 0; i < maxBillsToProcess; i++) {
      const nextId = await leaseNextBillId();
      if (!nextId) break;

      try {
        await processBill(nextId);
        const { error: releaseError } = await supabaseAdmin
          .from("bills")
          .update({
            summary_ok: true,
            summary_lease_until: null,
            summary_lease_owner: null,
          })
          .eq("id", nextId);
        if (releaseError) throw releaseError;
      } catch (err) {
        console.error(`❌ Failed processing bill ${nextId}:`, err);
        await supabaseAdmin
          .from("bills")
          .update({ summary_ok: false, summary_lease_until: null, summary_lease_owner: null })
          .eq("id", nextId);
        failures.push({ billId: nextId, reason: (err as Error).message });
      }
    }

    if (processedBills.length === 0) {
      return toJson({ message: "Sync complete. All bills are up-to-date." });
    }

    return toJson({
      message: `Processed ${processedBills.length} bill(s).`,
      processedBills,
      failures,
    });
  } catch (error) {
    console.error("Function failed:", error);
    return toJson({ error: (error as Error).message ?? "Unexpected error" }, 500);
  }
});
