// supabase/functions/sync-updated-bills/index.ts
// VERSION 3.0: Bilingual summaries, batching, and embedding updates

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

import { corsHeaders } from "../_shared/cors.ts";
import { getOptionalOpenAiKey } from "../_shared/utils.ts";

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

type ExistingBillRow = {
  id: number;
  bill_number: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  status_text: string | null;
  status_date: string | null;
  state_link: string | null;
  change_hash: string | null;
  original_text: string | null;
  original_text_formatted: string | null;
  summary_hash: string | null;
  embedding: unknown;
  summary_simple: string | null;
  summary_medium: string | null;
  summary_complex: string | null;
  summary_len_simple: number | null;
  progress: unknown;
  calendar: unknown;
  history: unknown;
};

type LegiScanBillResponse = {
  bill?: Record<string, any>;
  status?: string;
  alert?: unknown;
};

type LegiScanTextResponse = {
  text?: {
    doc?: string;
  };
  status?: string;
  alert?: unknown;
};

type LegiScanReservation = {
  allowed?: boolean;
  reason?: string;
  endpoint?: string;
  resource_key?: string;
  retry_after_seconds?: number;
  daily_count?: number;
  daily_limit?: number;
  monthly_count?: number;
  monthly_limit?: number;
};

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

const LEGISCAN_API_HEADERS = {
  Accept: "application/json",
  "User-Agent": "AIAdvocate/1.0 Supabase Edge Function",
};

const MAX_BILLS_PER_RUN = Math.max(
  0,
  Number.parseInt(Deno.env.get("SYNC_BILLS_PER_RUN") ?? "3", 10) || 0,
);
const RESPONSE_PREVIEW_LIMIT = Math.max(
  1,
  Math.min(
    25,
    Number.parseInt(Deno.env.get("SYNC_RESPONSE_PREVIEW_LIMIT") ?? "10", 10) ||
      10,
  ),
);
const MAX_MODEL_INPUT_CHARS = 12000;
const MIN_BILL_TEXT_CHARS = 120;
const MIN_SUMMARY_LENGTHS = {
  simple: 200,
  medium: 400,
  complex: 600,
};
const asciiGuard = /[^ -~\n]/;

const invalidSummaryPrefix = /^error[:\s]/i;
const invalidSummaryPlaceholder = /placeholder/i;

const parsePositiveInt = (
  value: string | number | null | undefined,
  fallback: number,
  max: number,
): number => {
  if (value === null || value === undefined || value === "") return fallback;

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;

  return Math.max(1, Math.min(Math.floor(parsed), max));
};

const useLegiScanForBillDetails = (): boolean =>
  (Deno.env.get("SYNC_USE_LEGISCAN") ?? "false").toLowerCase() === "true";

const getLegiScanDailyLimit = (): number =>
  parsePositiveInt(Deno.env.get("LEGISCAN_DAILY_QUERY_LIMIT"), 900, 1000);

const getLegiScanMonthlyLimit = (): number =>
  parsePositiveInt(Deno.env.get("LEGISCAN_MONTHLY_QUERY_LIMIT"), 25000, 30000);

const getLegiScanBillCooldownSeconds = (): number =>
  parsePositiveInt(
    Deno.env.get("LEGISCAN_GET_BILL_COOLDOWN_SECONDS"),
    3 * 60 * 60,
    31 * 24 * 60 * 60,
  );

const getLegiScanBillTextCooldownSeconds = (): number =>
  parsePositiveInt(
    Deno.env.get("LEGISCAN_GET_BILL_TEXT_COOLDOWN_SECONDS"),
    365 * 24 * 60 * 60,
    365 * 24 * 60 * 60,
  );

const isValidSummary = (value?: string | null): boolean => {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length < 40) return false;
  if (invalidSummaryPrefix.test(trimmed)) return false;
  if (invalidSummaryPlaceholder.test(trimmed)) return false;
  return true;
};

const validSummaryOrNull = (value?: string | null): string | null => {
  if (!isValidSummary(value)) return null;
  return value!.trim();
};

const isUsableBillText = (value?: string | null): boolean =>
  Boolean(value && value.trim().length >= MIN_BILL_TEXT_CHARS);

const errorToMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const syncDebugLogsEnabled = (): boolean =>
  (Deno.env.get("SYNC_DEBUG_LOGS") ?? "false").toLowerCase() === "true";

const logCronDebug = async (client: any, message: string): Promise<void> => {
  if (!syncDebugLogsEnabled()) return;
  try {
    await client.from("cron_job_errors").insert({
      job_name: "sync-updated-bills",
      error_message: `DEBUG: ${message}`,
    });
  } catch (error) {
    console.error("Failed to log sync debug message", error);
  }
};

const isAuthorizedRequest = async (
  supplied: string,
  envSecret: string,
  supabaseAdmin: any,
): Promise<boolean> => {
  if (!supplied) return false;
  if (envSecret && constantTimeEquals(supplied, envSecret)) return true;

  const { data, error } = await supabaseAdmin.rpc("is_valid_bill_sync_secret", {
    p_secret: supplied,
  });

  if (error) {
    console.error("Vault sync secret validation failed", {
      error: errorToMessage(error),
    });
    return false;
  }

  return data === true;
};

const reserveLegiScanCall = async (
  supabaseAdmin: any,
  endpoint: string,
  resourceKey: string,
  cooldownSeconds: number,
): Promise<LegiScanReservation> => {
  const { data, error } = await supabaseAdmin.rpc("reserve_legiscan_api_call", {
    p_endpoint: endpoint,
    p_resource_key: resourceKey,
    p_cooldown_seconds: cooldownSeconds,
    p_daily_limit: getLegiScanDailyLimit(),
    p_monthly_limit: getLegiScanMonthlyLimit(),
  });

  if (error) {
    console.error("LegiScan API reservation failed; refusing external call", {
      endpoint,
      resource_key: resourceKey,
      error: errorToMessage(error),
    });
    return {
      allowed: false,
      reason: "reservation_rpc_error",
      endpoint,
      resource_key: resourceKey,
    };
  }

  return (data ??
    {
      allowed: false,
      reason: "empty_reservation_response",
    }) as LegiScanReservation;
};

console.log(
  "🚀 Initializing sync-updated-bills v3.0 (Bilingual summaries + batching)",
);

const normalizeNewlines = (s: string) => s.replace(/\r\n?/g, "\n");
const collapseSpacesExceptNL = (s: string) => s.replace(/[^\S\n]+/g, " ");
const collapseNLBlocks = (s: string) => s.replace(/\n{3,}/g, "\n\n");

const sanitizeRawText = (raw: string): string =>
  normalizeNewlines(raw.replace(/\uFFFD/g, "")).replace(/Â/g, "").replace(
    /\u00A0/g,
    " ",
  );

const formatLegislationText = (raw: string): string => {
  if (!raw) return "";
  let working = raw;

  // 1. HTML Parsing (if applicable)
  if (working.trim().startsWith("<")) {
    try {
      const doc = new DOMParser().parseFromString(working, "text/html");
      const walk = (node: any, acc: string[] = []): string[] => {
        const nodeType = Number(node?.nodeType);
        if (nodeType === 3) { // Text node
          acc.push(String(node?.data ?? node?.textContent ?? ""));
        }
        if (nodeType === 1) { // Element node
          const tagName = String(node?.tagName ?? "").toUpperCase();
          if (
            ["SCRIPT", "STYLE", "NOSCRIPT", "HEAD", "META"].includes(tagName)
          ) {
            return acc;
          }

          // Block elements - add newlines before
          if (
            [
              "P",
              "DIV",
              "H1",
              "H2",
              "H3",
              "H4",
              "H5",
              "H6",
              "SECTION",
              "ARTICLE",
              "HEADER",
              "FOOTER",
              "LI",
              "TR",
            ].includes(tagName)
          ) {
            acc.push("\n");
          }

          // Lists
          if (tagName === "LI") acc.push("• ");

          // Tables
          if (tagName === "TR") acc.push("\n");
          if (tagName === "TD" || tagName === "TH") acc.push(" | ");

          // Line breaks
          if (tagName === "BR") acc.push("\n");

          for (const child of Array.from(node?.childNodes ?? [])) {
            walk(child, acc);
          }

          // Block elements - add newlines after
          if (
            [
              "P",
              "DIV",
              "H1",
              "H2",
              "H3",
              "H4",
              "H5",
              "H6",
              "SECTION",
              "ARTICLE",
              "HEADER",
              "FOOTER",
              "UL",
              "OL",
              "TABLE",
            ].includes(tagName)
          ) {
            acc.push("\n\n");
          }
        }
        return acc;
      };
      working = walk(doc?.body ?? ({} as any)).join("");
    } catch (error) {
      console.warn("DOMParser parse failure", { error: String(error) });
    }
  }

  // 2. Text Cleanup & Formatting
  working = normalizeNewlines(working);
  working = working.replace(/\uFFFD|Â|\u00A0/g, " ");
  working = collapseSpacesExceptNL(working);

  // Smart Formatting for Legislative Text
  // Ensure headers like "SECTION 1." or "Article 5" are on their own lines
  working = working
    .replace(/(\n\s*)?(SECTION\s+\d+\.?)/gi, "\n\n$2")
    .replace(/(\n\s*)?(ARTICLE\s+\d+\.?)/gi, "\n\n$2")
    .replace(/(\n\s*)?(CHAPTER\s+\d+\.?)/gi, "\n\n$2");

  // Collapse multiple newlines (max 2)
  working = collapseNLBlocks(working);

  return working.trim();
};

const scrapeLeginfoText = async (stateLink: string): Promise<string | null> => {
  try {
    const urlObj = new URL(stateLink);
    const billId = urlObj.searchParams.get("bill_id");
    if (!billId) return null;

    const leginfoUrl =
      `https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=${billId}`;
    const res = await fetch(leginfoUrl, { headers: BROWSER_HEADERS });
    if (!res.ok) return null;

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc) return null;

    const billContent = doc.getElementById("bill_all");
    if (!billContent) return null;

    return billContent.textContent || null;
  } catch (error) {
    console.warn("Leginfo scrape failed", { error: String(error) });
    return null;
  }
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
      const waitMs = Number.isFinite(retryAfterMs)
        ? Number(retryAfterMs)
        : backoffMs;
      console.warn("Retrying", {
        wait_ms: waitMs,
        attempt,
        error: String(error),
      });
      const jitter = Math.floor(Math.random() * 250);
      await sleep(waitMs + jitter);
      backoffMs = Math.min(backoffMs * 2, 16_000);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Retry logic exhausted without completion");
};

const fetchJsonWithRetries = async <T>(
  url: string,
  name: string,
  headers: Record<string, string> = BROWSER_HEADERS,
): Promise<T> => {
  return withRetries<T>(async (_attempt, signal) => {
    const res = await fetch(url, { headers, signal });
    if (!res.ok) {
      throw new HttpError(
        `${name} ${res.status}`,
        res.status,
        parseRetryAfter(res.headers.get("retry-after")),
      );
    }
    try {
      return await res.json() as T;
    } catch (error) {
      throw new Error(`${name} JSON parse failed: ${(error as Error).message}`);
    }
  });
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
        json_schema: {
          name: summarySchema.name,
          schema: summarySchema.schema,
          strict: true,
        },
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
    throw new Error(
      `Invalid JSON from OpenAI summarizer: ${(error as Error).message}`,
    );
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
    throw new Error(
      `Embedding dimension mismatch: expected 1536, received ${embedding.length}`,
    );
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
  return `${
    combined.slice(0, MAX_MODEL_INPUT_CHARS)
  }\n\n[Text truncated for model input. Focus on the salient sections above.]`;
};

const coalesceText = (...values: unknown[]): string | null => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const text = String(value);
    if (text.trim()) return text;
  }
  return null;
};

const coalesceValue = <T>(...values: Array<T | null | undefined>): T | null => {
  for (const value of values) {
    if (value !== null && value !== undefined) return value;
  }
  return null;
};

const arrayOrEmpty = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const billDataFromExistingRow = (
  row: ExistingBillRow,
): Record<string, any> => ({
  bill_id: row.id,
  bill_number: row.bill_number,
  title: row.title,
  description: row.description,
  status: row.status,
  status_text: row.status_text,
  status_date: row.status_date,
  state_link: row.state_link,
  change_hash: row.change_hash,
  progress: arrayOrEmpty(row.progress),
  calendar: arrayOrEmpty(row.calendar),
  history: arrayOrEmpty(row.history),
  summary: "",
});

const mergeBillDataWithExisting = (
  incoming: Record<string, any> | undefined,
  existing: ExistingBillRow,
): Record<string, any> => {
  const fallback = billDataFromExistingRow(existing);
  const source = incoming ?? {};

  return {
    ...fallback,
    ...source,
    bill_id: coalesceValue(source.bill_id, fallback.bill_id),
    bill_number: coalesceText(source.bill_number, fallback.bill_number),
    title: coalesceText(source.title, fallback.title),
    description: coalesceText(source.description, fallback.description),
    status: coalesceText(source.status, fallback.status),
    status_text: coalesceText(source.status_text, fallback.status_text),
    status_date: coalesceText(source.status_date, fallback.status_date),
    state_link: coalesceText(source.state_link, fallback.state_link),
    change_hash: coalesceText(source.change_hash, fallback.change_hash),
    progress: Array.isArray(source.progress)
      ? source.progress
      : fallback.progress,
    calendar: Array.isArray(source.calendar)
      ? source.calendar
      : fallback.calendar,
    history: Array.isArray(source.history) ? source.history : fallback.history,
  };
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
  const supplied = (req.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  if (req.method !== "POST") {
    return toJson({ error: "Method Not Allowed" }, 405);
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (!(await isAuthorizedRequest(supplied, AUTH, supabaseAdmin))) {
      return toJson({ error: "Unauthorized" }, 401);
    }

    const legiscanApiKey = Deno.env.get("LEGISCAN_API_KEY") ?? "";
    const legiscanDetailsEnabled = useLegiScanForBillDetails();
    const openAiKey = getOptionalOpenAiKey();
    if (!openAiKey) {
      throw new Error(
        "OpenAI API key is not set. Expected OpenAI_GPT_Key or OPENAI_API_KEY.",
      );
    }

    const owner = (crypto as any).randomUUID?.() ?? String(Date.now());
    const maxBillsToProcess = MAX_BILLS_PER_RUN;

    await logCronDebug(
      supabaseAdmin,
      `Starting run. owner=${owner} maxBillsToProcess=${maxBillsToProcess} legiscanDetailsEnabled=${legiscanDetailsEnabled}`,
    );

    const processedBills: number[] = [];
    const failures: Array<{ billId: number; reason: string }> = [];
    const legiscanReservations: LegiScanReservation[] = [];
    let legiscanRuntimeDisabledReason: string | null = null;

    const leaseNextBillId = async (): Promise<number | null> => {
      const { data, error } = await supabaseAdmin.rpc("lease_next_bill", {
        p_owner: owner,
        p_ttl_seconds: 900,
      });
      if (error) {
        try {
          await supabaseAdmin.from("cron_job_errors").insert({
            job_name: "sync-updated-bills",
            error_message: `DEBUG: lease_next_bill RPC error: ${
              JSON.stringify(error)
            }`,
          });
        } catch (e) {
          console.error("Failed to log RPC error", e);
        }
        throw error;
      }
      if (data === null || data === undefined) return null;
      const id = typeof data === "number" ? data : Number(data);
      return Number.isFinite(id) ? id : null;
    };

    const processBill = async (billId: number) => {
      console.log("Processing bill", { bill_id: billId });

      const { data: existingBillMeta, error: existingBillError } =
        await supabaseAdmin
          .from("bills")
          .select(
            "id,bill_number,title,description,status,status_text,status_date,state_link,change_hash,original_text,original_text_formatted,summary_hash,embedding,summary_simple,summary_medium,summary_complex,summary_len_simple,progress,calendar,history",
          )
          .eq("id", billId)
          .maybeSingle();
      if (existingBillError) {
        throw new Error(
          `Bill metadata lookup failed: ${errorToMessage(existingBillError)}`,
        );
      }
      if (!existingBillMeta) {
        throw new Error(`Bill ${billId} not found in database`);
      }

      let billData: any = billDataFromExistingRow(
        existingBillMeta as ExistingBillRow,
      );
      let decodedText: string | undefined;

      const existingText =
        isUsableBillText(existingBillMeta.original_text_formatted)
          ? existingBillMeta.original_text_formatted
          : existingBillMeta.original_text;
      if (isUsableBillText(existingText)) {
        console.log("- Reusing existing bill text", {
          bill_id: billData.bill_id,
          bill_number: billData.bill_number,
        });
        decodedText = existingText ?? undefined;
      }

      if (!decodedText && billData.state_link) {
        console.log("- Attempting Leginfo scrape", {
          bill_id: billId,
          link: billData.state_link,
        });
        decodedText = await scrapeLeginfoText(billData.state_link) ?? undefined;
      }

      if (
        !isUsableBillText(decodedText) &&
        legiscanDetailsEnabled &&
        legiscanApiKey &&
        !legiscanRuntimeDisabledReason
      ) {
        try {
          const billReservation = await reserveLegiScanCall(
            supabaseAdmin,
            "getBill",
            String(billId),
            getLegiScanBillCooldownSeconds(),
          );
          legiscanReservations.push(billReservation);

          if (!billReservation.allowed) {
            console.warn("- LegiScan getBill skipped by API guardrails", {
              bill_id: billId,
              reason: billReservation.reason,
              retry_after_seconds: billReservation.retry_after_seconds,
            });
          } else {
            const billDetailsUrl =
              `https://api.legiscan.com/?op=getBill&id=${billId}&key=${legiscanApiKey}`;

            const res = await fetchJsonWithRetries<LegiScanBillResponse>(
              billDetailsUrl,
              "legiscan getBill",
              LEGISCAN_API_HEADERS,
            );
            if (res.status === "ERROR") {
              throw new Error(
                `LegiScan error: ${JSON.stringify(res.alert || res)}`,
              );
            }
            billData = mergeBillDataWithExisting(
              res.bill,
              existingBillMeta as ExistingBillRow,
            );

            const latestTextDoc =
              Array.isArray(billData.texts) && billData.texts.length > 0
                ? billData.texts[billData.texts.length - 1]
                : null;

            if (latestTextDoc?.doc_id) {
              const textReservation = await reserveLegiScanCall(
                supabaseAdmin,
                "getBillText",
                String(latestTextDoc.doc_id),
                getLegiScanBillTextCooldownSeconds(),
              );
              legiscanReservations.push(textReservation);

              if (!textReservation.allowed) {
                console.warn(
                  "- LegiScan getBillText skipped by API guardrails",
                  {
                    bill_id: billId,
                    doc_id: latestTextDoc.doc_id,
                    reason: textReservation.reason,
                    retry_after_seconds: textReservation.retry_after_seconds,
                  },
                );
              } else {
                const billTextUrl =
                  `https://api.legiscan.com/?op=getBillText&id=${latestTextDoc.doc_id}&key=${legiscanApiKey}`;
                const textRes = await fetchJsonWithRetries<
                  LegiScanTextResponse
                >(
                  billTextUrl,
                  "legiscan getBillText",
                  LEGISCAN_API_HEADERS,
                );
                if (textRes.status === "ERROR") {
                  throw new Error(
                    `LegiScan text error: ${
                      JSON.stringify(textRes.alert || textRes)
                    }`,
                  );
                }
                if (textRes.text?.doc) {
                  const binaryString = atob(textRes.text.doc);
                  const bytes = Uint8Array.from(
                    binaryString,
                    (c) => c.charCodeAt(0),
                  );
                  const decoder = new TextDecoder("utf-8", { fatal: false });
                  decodedText = decoder
                    .decode(bytes)
                    .replace(/^\uFEFF/, "")
                    .replace(/[\u200B-\u200D\u2060]/g, "");
                }
              }
            }
          }
        } catch (err) {
          legiscanRuntimeDisabledReason = errorToMessage(err);
          console.warn(
            "- LegiScan failed; disabling LegiScan API calls for the rest of this run",
            {
              bill_id: billId,
              error: legiscanRuntimeDisabledReason,
            },
          );
        }
      } else if (
        !isUsableBillText(decodedText) && legiscanDetailsEnabled &&
        !legiscanApiKey
      ) {
        console.warn(
          "- SYNC_USE_LEGISCAN is enabled but LEGISCAN_API_KEY is missing",
          {
            bill_id: billId,
          },
        );
      } else if (
        !isUsableBillText(decodedText) && legiscanDetailsEnabled &&
        legiscanRuntimeDisabledReason
      ) {
        console.warn(
          "- LegiScan skipped because API calls are disabled for this run",
          {
            bill_id: billId,
            reason: legiscanRuntimeDisabledReason,
          },
        );
      }

      if (!isUsableBillText(decodedText)) {
        console.warn(
          "- No full bill text from LegiScan, Leginfo, or database",
          {
            bill_id: billData.bill_id,
            bill_number: billData.bill_number,
          },
        );
        throw new Error("No full bill text available for summary generation");
      }

      const originalTextRaw = sanitizeRawText(decodedText ?? "");
      if (!isUsableBillText(originalTextRaw)) {
        throw new Error("Fetched bill text is empty or too short");
      }

      const originalTextFormatted = formatLegislationText(originalTextRaw);
      if (!isUsableBillText(originalTextFormatted)) {
        throw new Error("Formatter returned empty or too-short bill text");
      }

      const { data: existingSpanish, error: existingSpanishError } =
        await supabaseAdmin
          .from("bill_translations")
          .select("summary_simple, summary_medium, summary_complex")
          .eq("bill_id", billData.bill_id)
          .eq("language_code", "es")
          .maybeSingle();
      if (existingSpanishError) {
        throw new Error(
          `Spanish translation lookup failed: ${
            errorToMessage(existingSpanishError)
          }`,
        );
      }

      const existingSimple = validSummaryOrNull(
        existingBillMeta?.summary_simple,
      );
      const existingMedium = validSummaryOrNull(
        existingBillMeta?.summary_medium,
      );
      const existingComplex = validSummaryOrNull(
        existingBillMeta?.summary_complex,
      );
      const existingSpanishSimple = validSummaryOrNull(
        existingSpanish?.summary_simple,
      );
      const existingSpanishMedium = validSummaryOrNull(
        existingSpanish?.summary_medium,
      );
      const existingSpanishComplex = validSummaryOrNull(
        existingSpanish?.summary_complex,
      );

      const needsSummaryGeneration = !existingSimple ||
        !existingMedium ||
        !existingComplex ||
        !existingSpanishSimple ||
        !existingSpanishMedium ||
        !existingSpanishComplex;

      let asciiEnglish:
        | { simple: string; medium: string; complex: string }
        | null = null;
      let spanishTrimmed:
        | { simple: string; medium: string; complex: string }
        | null = null;

      if (needsSummaryGeneration) {
        console.log("- Summarizing", {
          bill_id: billData.bill_id,
          bill_number: billData.bill_number,
        });
        const summarizerSource = buildSummarizerSource(
          billData,
          originalTextFormatted,
        );

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

        if (
          !englishSummaries?.simple || !englishSummaries?.medium ||
          !englishSummaries?.complex
        ) {
          throw new Error("Incomplete English summaries returned");
        }
        if (
          !spanishSummaries?.simple || !spanishSummaries?.medium ||
          !spanishSummaries?.complex
        ) {
          throw new Error("Incomplete Spanish summaries returned");
        }

        asciiEnglish = {
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

        if (
          !existingSimple &&
          asciiEnglish.simple.length < MIN_SUMMARY_LENGTHS.simple
        ) {
          throw new Error(
            `Simple summary below minimum length (${asciiEnglish.simple.length})`,
          );
        }
        if (
          !existingMedium &&
          asciiEnglish.medium.length < MIN_SUMMARY_LENGTHS.medium
        ) {
          throw new Error(
            `Medium summary below minimum length (${asciiEnglish.medium.length})`,
          );
        }
        if (
          !existingComplex &&
          asciiEnglish.complex.length < MIN_SUMMARY_LENGTHS.complex
        ) {
          throw new Error(
            `Complex summary below minimum length (${asciiEnglish.complex.length})`,
          );
        }

        spanishTrimmed = {
          simple: spanishSummaries.simple.trim(),
          medium: spanishSummaries.medium.trim(),
          complex: spanishSummaries.complex.trim(),
        };

        if (Object.values(spanishTrimmed).some((text) => !text)) {
          throw new Error("Spanish summaries contain empty values after trim");
        }
      }

      const existingSummaryHash = existingBillMeta?.summary_hash ?? null;
      const existingEmbeddingValue = existingBillMeta?.embedding ?? null;

      const englishFinal = {
        simple: existingSimple ?? asciiEnglish?.simple ?? null,
        medium: existingMedium ?? asciiEnglish?.medium ?? null,
        complex: existingComplex ?? asciiEnglish?.complex ?? null,
      };

      if (!isValidSummary(englishFinal.simple)) {
        throw new Error("Generated simple summary invalid or placeholder");
      }
      if (!isValidSummary(englishFinal.medium)) {
        throw new Error("Generated medium summary invalid or placeholder");
      }
      if (!isValidSummary(englishFinal.complex)) {
        throw new Error("Generated complex summary invalid or placeholder");
      }

      const summaryHash = await sha256(englishFinal.complex!);
      const summaryLenSimple = englishFinal.simple!.length;

      const existingEmbeddingSerialized = reuseEmbedding(
        existingEmbeddingValue,
      );
      const summaryHashUnchanged = existingSummaryHash !== null &&
        existingSummaryHash === summaryHash;

      let embeddingPayload: string | null = null;

      if (summaryHashUnchanged) {
        if (existingEmbeddingSerialized) {
          console.log("- Reusing embedding", {
            bill_id: billData.bill_id,
            bill_number: billData.bill_number,
          });
        } else {
          console.warn(
            "- Missing embedding despite matching hash; regenerating",
            {
              bill_id: billData.bill_id,
              bill_number: billData.bill_number,
            },
          );
        }
      }

      if (!summaryHashUnchanged || !existingEmbeddingSerialized) {
        console.log("- Embedding", {
          bill_id: billData.bill_id,
          bill_number: billData.bill_number,
        });
        const textForEmbedding = [
          `Title: ${billData.title}`,
          billData.description ? `Description: ${billData.description}` : null,
          `Expert Summary: ${englishFinal.complex}`,
        ]
          .filter((segment): segment is string => Boolean(segment))
          .join("\n\n");

        const embedding = await withRetries((_, signal) =>
          callEmbedding(textForEmbedding, openAiKey, signal)
        );

        embeddingPayload = `[${embedding.join(",")}]`;
      }

      const spanishFinal = {
        simple: existingSpanishSimple ??
          (isValidSummary(spanishTrimmed?.simple)
            ? spanishTrimmed!.simple
            : null),
        medium: existingSpanishMedium ??
          (isValidSummary(spanishTrimmed?.medium)
            ? spanishTrimmed!.medium
            : null),
        complex: existingSpanishComplex ??
          (isValidSummary(spanishTrimmed?.complex)
            ? spanishTrimmed!.complex
            : null),
      };

      const needsSpanishUpsert = existingSpanishSimple === null ||
        existingSpanishMedium === null || existingSpanishComplex === null;

      const spanishComplete = spanishFinal.simple !== null &&
        spanishFinal.medium !== null && spanishFinal.complex !== null;

      let spanishPayload: Record<string, unknown> | null = null;
      if (needsSpanishUpsert) {
        if (spanishComplete) {
          spanishPayload = {
            bill_id: billData.bill_id,
            language_code: "es",
            summary_simple: spanishFinal.simple!,
            summary_medium: spanishFinal.medium!,
            summary_complex: spanishFinal.complex!,
            updated_at: new Date().toISOString(),
          };
        } else {
          console.warn(
            "Skipping Spanish translation update due to invalid summaries",
            {
              bill_id: billData.bill_id,
              bill_number: billData.bill_number,
            },
          );
        }
      }

      const statusText = billData.status_text ?? null;
      const statusDate = billData.status_date ?? null;
      const progress = Array.isArray(billData.progress)
        ? billData.progress
        : [];
      const calendar = Array.isArray(billData.calendar)
        ? billData.calendar
        : [];
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
        summary_simple: englishFinal.simple!,
        summary_medium: englishFinal.medium!,
        summary_complex: englishFinal.complex!,
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

      const { error: rpcError } = await supabaseAdmin.rpc(
        "upsert_bill_and_translation",
        { bill: billPayload, tr: spanishPayload },
      );
      if (rpcError) {
        throw new Error(
          `upsert_bill_and_translation failed: ${errorToMessage(rpcError)}`,
        );
      }

      console.log("- Summary checks", {
        bill_id: billData.bill_id,
        raw_len: originalTextRaw.length,
        formatted_len: originalTextFormatted.length,
        summary_ok: true,
      });

      processedBills.push(billData.bill_id);
      console.log("✅ Processed bill", {
        bill_id: billData.bill_id,
        bill_number: billData.bill_number,
      });
    };

    for (let i = 0; i < maxBillsToProcess; i++) {
      const nextId = await leaseNextBillId();
      if (!nextId) {
        await logCronDebug(
          supabaseAdmin,
          `lease_next_bill returned null at iteration ${i}`,
        );
        break;
      }

      try {
        await processBill(nextId);
        const { error: releaseError } = await supabaseAdmin
          .rpc("release_bill_lease", {
            p_id: nextId,
            p_owner: owner,
            p_ok: true,
          });
        if (releaseError) throw releaseError;
      } catch (err) {
        const failureReason = errorToMessage(err);
        console.error("❌ Failed processing bill", {
          bill_id: nextId,
          error: failureReason,
        });

        // Log error to cron_job_errors table
        try {
          await supabaseAdmin.from("cron_job_errors").insert({
            job_name: "sync-updated-bills",
            error_message: `Bill ${nextId} failed: ${failureReason}`,
          });
        } catch (e) {
          console.error("Failed to log bill failure", e);
        }

        const { error: releaseError } = await supabaseAdmin
          .rpc("release_bill_lease", {
            p_id: nextId,
            p_owner: owner,
            p_ok: false,
          });
        if (releaseError) {
          console.error("Failed to release lease", {
            bill_id: nextId,
            error: String(releaseError),
          });
        }
        failures.push({ billId: nextId, reason: failureReason });
      }
    }

    if (processedBills.length === 0 && failures.length > 0) {
      return toJson({
        error:
          "All leased bills failed during text import or summary generation.",
        failuresCount: failures.length,
        failuresPreview: failures.slice(0, RESPONSE_PREVIEW_LIMIT),
        legiscan: {
          enabled: legiscanDetailsEnabled,
          disabled_for_run_reason: legiscanRuntimeDisabledReason,
          reservationsPreview: legiscanReservations.slice(
            0,
            RESPONSE_PREVIEW_LIMIT,
          ),
        },
      }, 500);
    }

    if (processedBills.length === 0) {
      return toJson({
        message: "Sync complete. All bills are up-to-date.",
        legiscan: {
          enabled: legiscanDetailsEnabled,
          disabled_for_run_reason: legiscanRuntimeDisabledReason,
          reservationsPreview: legiscanReservations.slice(
            0,
            RESPONSE_PREVIEW_LIMIT,
          ),
        },
      });
    }

    return toJson({
      message: `Processed ${processedBills.length} bill(s).`,
      processedBillsCount: processedBills.length,
      processedBillsPreview: processedBills.slice(0, RESPONSE_PREVIEW_LIMIT),
      failuresCount: failures.length,
      failuresPreview: failures.slice(0, RESPONSE_PREVIEW_LIMIT),
      legiscan: {
        enabled: legiscanDetailsEnabled,
        disabled_for_run_reason: legiscanRuntimeDisabledReason,
        reservationsPreview: legiscanReservations.slice(
          0,
          RESPONSE_PREVIEW_LIMIT,
        ),
      },
    });
  } catch (error) {
    const message = errorToMessage(error);
    console.error("Function failed", { error: message });
    return toJson({ error: message || "Unexpected error" }, 500);
  }
});
