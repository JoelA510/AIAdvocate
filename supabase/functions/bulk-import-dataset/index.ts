// supabase/functions/bulk-import-dataset/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip";
import { ensureEnv, getServiceKey } from "../_shared/utils.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { isAuthorizedCronOrAdmin } from "../_shared/auth.ts";

const LEGISCAN_API_HEADERS = {
  Accept: "application/json",
  "User-Agent": "AIAdvocate/1.0 Supabase Edge Function",
};

const RELEVANT_KEYWORDS = [
  "trafficking",
  "human trafficking",
  "human trafficker",
  "trafficked",
  "victim",
  "survivor",
  "abuse",
  "coercion",
  "assault",
  "domestic violence",
  "sexual violence",
  "sex work",
  "sex worker",
  "prostitution",
  "solicitation",
];

const KEYWORD_REGEX = new RegExp(`\\b(${RELEVANT_KEYWORDS.join("|")})\\b`, "i");

// The LegiScan dataset only carries bill metadata (title + the "An act to
// amend …" description), so a title/description keyword match cannot see terms
// that appear in the operative bill text. CA AB2691 ("Elections: elective
// office: felony conviction.") is the canonical example: the disqualifying
// crimes "sexual assault" and "human trafficking" only appear in Section 1.
// These phrases are therefore run through LegiScan's full-text search engine,
// which indexes the bill text itself.
const RELEVANT_SEARCH_PHRASES = [
  "human trafficking",
  "sex trafficking",
  "labor trafficking",
  "trafficking victim",
  "commercial sexual exploitation",
  "sexual exploitation",
  "sexual assault",
  "sexual abuse",
  "sexual violence",
  "child sexual abuse",
  "domestic violence",
  "intimate partner violence",
  "forced labor",
  "involuntary servitude",
  "prostitution",
];

// LegiScan's search engine ranks by relevance rather than matching the quoted
// phrase exactly, so a raw search hit is a *candidate*, not a match: a dry run
// surfaced a groundwater-sustainability act among the results. Every candidate
// is therefore confirmed against the actual bill text on leginfo (free, no API
// quota) before it is written to `bills`.
//
// This must be derived from the same phrase list the sweep searches for. When
// it was pinned to the built-in constant, overriding BULK_IMPORT_SEARCH_PHRASES
// made discovery search the new terms while verification still only accepted
// the old ones — every hit failed and was written to the permanent rejection
// cache.
const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildVerifyRegex = (phrases: string[]): RegExp =>
  new RegExp(`(${phrases.map(escapeRegExp).join("|")})`, "i");

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
};

const CURSOR_KEY_PREFIX = "bulk_import_dataset";
const SEARCH_PENDING_KEY_PREFIX = "bulk_import_search_pending";
const DEFAULT_FILES_PER_INVOCATION = 10000;
const MAX_FILES_PER_INVOCATION = 10000;
const DEFAULT_UPSERT_BATCH_SIZE = 40;
const MAX_UPSERT_BATCH_SIZE = 100;
const ERROR_PREVIEW_LIMIT = 10;
const DEFAULT_MAX_RUNTIME_MS = 18_000;
const HARD_MAX_RUNTIME_MS = 26_000;
const DEADLINE_GUARD_MS = 1_250;
const DATASET_LIST_CACHE_KEY_PREFIX = "legiscan_dataset_list";
const DEFAULT_SEARCH_PAGES_PER_PHRASE = 2;
const MAX_SEARCH_PAGES_PER_PHRASE = 20;
// LegiScan's Terms of Service treat rapid bursts as abuse and will lock the API
// key. Space search calls out and keep the per-run total small; the per-page
// cooldown means unqueried phrases are simply picked up on a later run.
const DEFAULT_SEARCH_DELAY_MS = 1_500;
const DEFAULT_SEARCH_MAX_CALLS_PER_RUN = 6;
const DEFAULT_VERIFY_PER_RUN = 8;
const DEFAULT_VERIFY_DELAY_MS = 250;
const MAX_PENDING_QUEUE = 2_000;
const MAX_REJECTED_TRACKED = 5_000;
const DEFAULT_SEARCH_MIN_RELEVANCE = 50;
const DEFAULT_SEARCH_MAX_NEW_BILLS = 250;
// The active CA snapshot is ~26 MB zipped (~35 MB once base64-encoded), which
// exceeds what an Edge Function worker can decode without being terminated.
// Skip the download above this size instead of losing the whole invocation.
const DEFAULT_MAX_DATASET_BYTES = 20_000_000;

type SupabaseAdminClient = any;

type LegiScanDataset = {
  prior: number;
  session_id: number | string;
  access_key: string;
  session_title?: string;
  dataset_hash?: string;
  dataset_size?: number | string;
  year_start?: number | string;
  year_end?: number | string;
};

type BillSeedRow = {
  id: number;
  bill_number: string;
  title: string;
  description: string | null;
  status: string | null;
  state_link: string | null;
  change_hash: string | null;
  summary_simple: string | null;
};

type CursorState = {
  session_id: number;
  state: string;
  dataset_hash: string | null;
  next_index: number;
  total_files: number;
  completed_at: string | null;
  updated_at: string;
};

type RequestOptions = {
  force_restart: boolean;
  max_files: number;
  dry_run: boolean;
  skip_search: boolean;
  skip_dataset: boolean;
};

type SearchDiscoveryStats = {
  enabled: boolean;
  dry_run: boolean;
  phrases_queried: number;
  pages_fetched: number;
  pages_skipped_by_guardrails: number;
  results_seen: number;
  candidate_bills: number;
  new_bills: number;
  inserted_count: number;
  capped: boolean;
  aborted: string | null;
  abort_message: string | null;
  pending_queue_size: number;
  verify_attempted: number;
  verified_count: number;
  rejected_count: number;
  unverifiable_count: number;
  verify_unavailable: number;
  error_count: number;
  errors: string[];
  sample_new_bills: Array<{ id: number; bill_number: string; title: string }>;
};

type BatchStats = {
  processed_files: number;
  matched_bills: number;
  inserted_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  errors: Array<{ file: string; error: string }>;
};

type SummarySyncEnqueueResult = {
  requested_count: number;
  enqueued_count: number;
  error_count: number;
  errors: string[];
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

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

const parseBillId = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const toNullableString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > 0 ? text : null;
};

const buildCursorKey = (state: string, sessionId: number): string =>
  `${CURSOR_KEY_PREFIX}:${state.toLowerCase()}:${sessionId}`;

const readRequestOptions = async (req: Request): Promise<RequestOptions> => {
  const url = new URL(req.url);
  const body = await req.json().catch(() => ({}));

  const maxFilesFromQuery = url.searchParams.get("max_files");
  const maxFilesFromBody =
    typeof body?.max_files === "number" || typeof body?.max_files === "string"
      ? body.max_files
      : undefined;
  const maxFilesFromEnv = Deno.env.get("BULK_IMPORT_MAX_FILES_PER_INVOCATION");

  const maxFiles = parsePositiveInt(
    maxFilesFromQuery ?? maxFilesFromBody ?? maxFilesFromEnv,
    DEFAULT_FILES_PER_INVOCATION,
    MAX_FILES_PER_INVOCATION,
  );

  const flag = (name: string): boolean =>
    url.searchParams.get(name) === "1" ||
    url.searchParams.get(name) === "true" ||
    body?.[name] === true;

  return {
    force_restart: flag("force_restart"),
    max_files: maxFiles,
    dry_run: flag("dry_run"),
    skip_search: flag("skip_search"),
    skip_dataset: flag("skip_dataset"),
  };
};

const getMaxRuntimeMs = (): number =>
  parsePositiveInt(
    Deno.env.get("BULK_IMPORT_MAX_RUNTIME_MS"),
    DEFAULT_MAX_RUNTIME_MS,
    HARD_MAX_RUNTIME_MS,
  );

const getUpsertBatchSize = (): number =>
  parsePositiveInt(
    Deno.env.get("BULK_IMPORT_UPSERT_BATCH_SIZE"),
    DEFAULT_UPSERT_BATCH_SIZE,
    MAX_UPSERT_BATCH_SIZE,
  );

const getLegiScanDailyLimit = (): number =>
  parsePositiveInt(Deno.env.get("LEGISCAN_DAILY_QUERY_LIMIT"), 900, 1000);

const getLegiScanMonthlyLimit = (): number =>
  parsePositiveInt(Deno.env.get("LEGISCAN_MONTHLY_QUERY_LIMIT"), 25000, 30000);

const getDatasetListCooldownSeconds = (): number =>
  parsePositiveInt(
    Deno.env.get("LEGISCAN_DATASET_LIST_COOLDOWN_SECONDS"),
    7 * 24 * 60 * 60,
    31 * 24 * 60 * 60,
  );

const getDatasetCooldownSeconds = (): number =>
  parsePositiveInt(
    Deno.env.get("LEGISCAN_DATASET_COOLDOWN_SECONDS"),
    7 * 24 * 60 * 60,
    31 * 24 * 60 * 60,
  );

/**
 * Cooldown used while a dataset cursor pass is still in progress. The full
 * cooldown assumes one download per snapshot, but a bounded cursor pass needs
 * many invocations over the same snapshot to finish; applying the weekly
 * cooldown to those freezes the pass permanently.
 */
const getDatasetResumeCooldownSeconds = (): number =>
  parsePositiveInt(
    Deno.env.get("LEGISCAN_DATASET_RESUME_COOLDOWN_SECONDS"),
    6 * 60 * 60,
    31 * 24 * 60 * 60,
  );

const getMaxDatasetBytes = (): number =>
  parsePositiveInt(
    Deno.env.get("BULK_IMPORT_MAX_DATASET_BYTES"),
    DEFAULT_MAX_DATASET_BYTES,
    Number.MAX_SAFE_INTEGER,
  );

const datasetPassEnabled = (): boolean =>
  (Deno.env.get("BULK_IMPORT_DATASET_PASS") ?? "true").toLowerCase() !==
    "false";

const searchDiscoveryEnabled = (): boolean =>
  (Deno.env.get("BULK_IMPORT_SEARCH_DISCOVERY") ?? "true").toLowerCase() !==
    "false";

const getSearchPhrases = (): string[] => {
  const raw = Deno.env.get("BULK_IMPORT_SEARCH_PHRASES");
  if (!raw) return RELEVANT_SEARCH_PHRASES;

  const phrases = raw
    .split("|")
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase.length > 0);

  return phrases.length > 0 ? phrases : RELEVANT_SEARCH_PHRASES;
};

const getSearchPagesPerPhrase = (): number =>
  parsePositiveInt(
    Deno.env.get("BULK_IMPORT_SEARCH_PAGES_PER_PHRASE"),
    DEFAULT_SEARCH_PAGES_PER_PHRASE,
    MAX_SEARCH_PAGES_PER_PHRASE,
  );

const getSearchMinRelevance = (): number => {
  const raw = Deno.env.get("BULK_IMPORT_SEARCH_MIN_RELEVANCE");
  if (raw === null || raw === undefined || raw === "") {
    return DEFAULT_SEARCH_MIN_RELEVANCE;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_SEARCH_MIN_RELEVANCE;
  return Math.max(0, Math.min(Math.floor(parsed), 100));
};

const getSearchMaxNewBills = (): number =>
  parsePositiveInt(
    Deno.env.get("BULK_IMPORT_SEARCH_MAX_NEW_BILLS"),
    DEFAULT_SEARCH_MAX_NEW_BILLS,
    5000,
  );

const getSearchDelayMs = (): number =>
  parsePositiveInt(
    Deno.env.get("LEGISCAN_SEARCH_DELAY_MS"),
    DEFAULT_SEARCH_DELAY_MS,
    10_000,
  );

const getSearchMaxCallsPerRun = (): number =>
  parsePositiveInt(
    Deno.env.get("LEGISCAN_SEARCH_MAX_CALLS_PER_RUN"),
    DEFAULT_SEARCH_MAX_CALLS_PER_RUN,
    50,
  );

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const getSearchCooldownSeconds = (): number =>
  parsePositiveInt(
    Deno.env.get("LEGISCAN_SEARCH_COOLDOWN_SECONDS"),
    20 * 60 * 60,
    31 * 24 * 60 * 60,
  );

const summarySyncEnqueueEnabled = (): boolean =>
  (Deno.env.get("BULK_IMPORT_ENQUEUE_SUMMARY_SYNC") ?? "true").toLowerCase() !==
    "false";

const getSummarySyncInvocationCount = (candidateRows: number): number => {
  if (!summarySyncEnqueueEnabled()) return 0;
  if (candidateRows <= 0) return 0;

  const explicitCount = Deno.env.get("BULK_IMPORT_SUMMARY_SYNC_INVOCATIONS");
  if (
    explicitCount !== null && explicitCount !== undefined &&
    explicitCount !== ""
  ) {
    return parsePositiveInt(explicitCount, 1, 20);
  }

  const billsPerRun = parsePositiveInt(
    Deno.env.get("SYNC_BILLS_PER_RUN"),
    3,
    50,
  );
  const maxInvocations = parsePositiveInt(
    Deno.env.get("BULK_IMPORT_MAX_SUMMARY_SYNC_INVOCATIONS"),
    10,
    20,
  );

  return Math.max(
    1,
    Math.min(
      Math.ceil(Math.max(candidateRows, 1) / billsPerRun),
      maxInvocations,
    ),
  );
};

const enqueueSummarySyncs = async (
  supabaseAdmin: SupabaseAdminClient,
  count: number,
): Promise<SummarySyncEnqueueResult> => {
  const result: SummarySyncEnqueueResult = {
    requested_count: count,
    enqueued_count: 0,
    error_count: 0,
    errors: [],
  };

  for (let i = 0; i < count; i += 1) {
    const { error } = await supabaseAdmin.rpc("invoke_edge_function", {
      endpoint: "sync-updated-bills",
      job_name: "daily-bill-sync",
    });

    if (error) {
      result.error_count += 1;
      if (result.errors.length < ERROR_PREVIEW_LIMIT) {
        result.errors.push(error.message ?? String(error));
      }
      continue;
    }

    result.enqueued_count += 1;
  }

  return result;
};

const reserveLegiScanCall = async (
  supabaseAdmin: SupabaseAdminClient,
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
      error: error.message ?? String(error),
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

const getCursor = async (
  supabaseAdmin: SupabaseAdminClient,
  key: string,
): Promise<CursorState | null> => {
  const { data, error } = await supabaseAdmin
    .from("ingestion_cursors")
    .select("cursor")
    .eq("key", key)
    .maybeSingle();

  if (error) throw error;
  if (!data?.cursor) return null;

  return data.cursor as CursorState;
};

const setCursor = async (
  supabaseAdmin: SupabaseAdminClient,
  key: string,
  cursor: CursorState,
): Promise<void> => {
  const { error } = await supabaseAdmin
    .from("ingestion_cursors")
    .upsert(
      {
        key,
        cursor,
        updated_at: cursor.updated_at,
      },
      { onConflict: "key" },
    );

  if (error) throw error;
};

const datasetListCacheKey = (state: string): string =>
  `${DATASET_LIST_CACHE_KEY_PREFIX}:${state.toLowerCase()}`;

const getDatasetListCache = async (
  supabaseAdmin: SupabaseAdminClient,
  state: string,
): Promise<{ datasetlist: LegiScanDataset[]; updated_at: string } | null> => {
  const { data, error } = await supabaseAdmin
    .from("ingestion_cursors")
    .select("cursor, updated_at")
    .eq("key", datasetListCacheKey(state))
    .maybeSingle();

  if (error) throw error;

  const datasetlist = data?.cursor?.datasetlist;
  if (!Array.isArray(datasetlist)) return null;

  return {
    datasetlist: datasetlist as LegiScanDataset[],
    updated_at: String(data.updated_at ?? data.cursor?.updated_at ?? ""),
  };
};

const setDatasetListCache = async (
  supabaseAdmin: SupabaseAdminClient,
  state: string,
  datasetlist: LegiScanDataset[],
): Promise<void> => {
  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("ingestion_cursors")
    .upsert(
      {
        key: datasetListCacheKey(state),
        cursor: {
          state,
          datasetlist,
          updated_at: nowIso,
        },
        updated_at: nowIso,
      },
      { onConflict: "key" },
    );

  if (error) throw error;
};

const isCacheFresh = (updatedAt: string, cooldownSeconds: number): boolean => {
  const updatedMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedMs)) return false;
  return Date.now() - updatedMs < cooldownSeconds * 1000;
};

const flushUpsertBatch = async (
  supabaseAdmin: SupabaseAdminClient,
  rows: BillSeedRow[],
): Promise<{ inserted: number; updated: number }> => {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  const dedupedRows = Array.from(
    rows.reduce(
      (map, row) => map.set(row.id, row),
      new Map<number, BillSeedRow>(),
    ).values(),
  );

  const billIds = dedupedRows.map((bill) => bill.id);

  // Fetch all existing summary fields to preserve them
  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from("bills")
    .select("id, summary_simple, summary_medium, summary_complex")
    .in("id", billIds);

  if (existingError) throw existingError;

  const existingDataMap = new Map<number, any>();
  (existingRows ?? []).forEach((row: any) => {
    existingDataMap.set(row.id, row);
  });

  const finalRows = dedupedRows.map((bill) => {
    const existing = existingDataMap.get(bill.id);
    if (existing) {
      return {
        ...bill,
        summary_simple: existing.summary_simple,
        summary_medium: existing.summary_medium,
        summary_complex: existing.summary_complex,
      };
    }
    return bill;
  });

  const { error } = await supabaseAdmin
    .from("bills")
    .upsert(finalRows, { onConflict: "id" });

  if (error) throw error;

  const updated = (existingRows ?? []).length;
  const inserted = finalRows.length - updated;

  return { inserted, updated };
};

const toNullableInt = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
};

/**
 * CA bill status permalink, matching the `state_link` LegiScan reports in the
 * dataset (e.g. `…?bill_id=202520260AB2691`). `sync-updated-bills` scrapes this
 * URL for the bill text, so seeding it avoids a LegiScan `getBill` call per
 * newly discovered bill.
 */
const buildCaStateLink = (
  billNumber: string,
  yearStart: number | null,
  yearEnd: number | null,
): string | null => {
  if (!billNumber || yearStart === null || yearEnd === null) return null;
  return "https://leginfo.legislature.ca.gov/faces/billStatusClient.xhtml" +
    `?bill_id=${yearStart}${yearEnd}0${billNumber}`;
};

const selectExistingBillIds = async (
  supabaseAdmin: SupabaseAdminClient,
  billIds: number[],
): Promise<Set<number>> => {
  const existing = new Set<number>();
  const chunkSize = 500;

  for (let i = 0; i < billIds.length; i += chunkSize) {
    const chunk = billIds.slice(i, i + chunkSize);
    const { data, error } = await supabaseAdmin
      .from("bills")
      .select("id")
      .in("id", chunk);

    if (error) throw error;
    (data ?? []).forEach((row: { id: number }) => existing.add(Number(row.id)));
  }

  return existing;
};

const getVerifyPerRun = (): number =>
  parsePositiveInt(
    Deno.env.get("BULK_IMPORT_VERIFY_PER_RUN"),
    DEFAULT_VERIFY_PER_RUN,
    100,
  );

const getVerifyDelayMs = (): number =>
  parsePositiveInt(
    Deno.env.get("BULK_IMPORT_VERIFY_DELAY_MS"),
    DEFAULT_VERIFY_DELAY_MS,
    5_000,
  );

type PendingState = {
  rows: BillSeedRow[];
  rejected: number[];
};

const pendingKey = (state: string, sessionId: number): string =>
  `${SEARCH_PENDING_KEY_PREFIX}:${state.toLowerCase()}:${sessionId}`;

const getPendingState = async (
  supabaseAdmin: SupabaseAdminClient,
  key: string,
): Promise<PendingState> => {
  const { data, error } = await supabaseAdmin
    .from("ingestion_cursors")
    .select("cursor")
    .eq("key", key)
    .maybeSingle();

  if (error) throw error;

  const cursor = data?.cursor ?? {};
  return {
    rows: Array.isArray(cursor.rows) ? cursor.rows as BillSeedRow[] : [],
    rejected: Array.isArray(cursor.rejected)
      ? (cursor.rejected as unknown[]).map(Number).filter(Number.isFinite)
      : [],
  };
};

const setPendingState = async (
  supabaseAdmin: SupabaseAdminClient,
  key: string,
  state: PendingState,
): Promise<void> => {
  const nowIso = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("ingestion_cursors")
    .upsert(
      {
        key,
        cursor: {
          rows: state.rows.slice(0, MAX_PENDING_QUEUE),
          rejected: state.rejected.slice(-MAX_REJECTED_TRACKED),
          updated_at: nowIso,
        },
        updated_at: nowIso,
      },
      { onConflict: "key" },
    );

  if (error) throw error;
};

/**
 * Outcome of confirming a candidate against the real bill text.
 *
 * `unavailable` is distinct from `rejected` so a transient leginfo failure
 * retries later, while `unverifiable` (no usable link — a condition retrying
 * can never fix) drops the row instead of parking it in the queue forever.
 */
type VerifyOutcome = "match" | "rejected" | "unavailable" | "unverifiable";

const billTextMentionsTopic = async (
  stateLink: string | null,
  verifyRegex: RegExp,
): Promise<VerifyOutcome> => {
  if (!stateLink) return "unverifiable";

  let billId: string | null;
  try {
    billId = new URL(stateLink).searchParams.get("bill_id");
  } catch {
    return "unverifiable";
  }
  if (!billId) return "unverifiable";

  try {
    const response = await fetch(
      `https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=${billId}`,
      { headers: BROWSER_HEADERS },
    );
    if (!response.ok) return "unavailable";

    const html = await response.text();
    const anchor = html.indexOf('id="bill_all"');
    // No text published yet (introduced but not printed): worth retrying.
    if (anchor < 0) return "unavailable";

    const text = html
      .slice(anchor)
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ");

    return verifyRegex.test(text) ? "match" : "rejected";
  } catch (error) {
    console.warn("leginfo verification fetch failed", { error: String(error) });
    return "unavailable";
  }
};

/**
 * Discover relevant bills through LegiScan's full-text search engine.
 *
 * The dataset pass can only match the bill title, so bills that address these
 * topics in their operative text are invisible to it. One `getSearch` call per
 * (phrase, page) is reserved through the same guardrails as the dataset calls.
 */
const runSearchDiscovery = async (
  supabaseAdmin: SupabaseAdminClient,
  legiscanApiKey: string,
  options: {
    sessionId: number;
    state: string;
    yearStart: number | null;
    yearEnd: number | null;
    dryRun: boolean;
    stopAt: number;
  },
): Promise<SearchDiscoveryStats> => {
  const stats: SearchDiscoveryStats = {
    enabled: true,
    dry_run: options.dryRun,
    phrases_queried: 0,
    pages_fetched: 0,
    pages_skipped_by_guardrails: 0,
    results_seen: 0,
    candidate_bills: 0,
    new_bills: 0,
    inserted_count: 0,
    capped: false,
    aborted: null,
    abort_message: null,
    pending_queue_size: 0,
    verify_attempted: 0,
    verified_count: 0,
    rejected_count: 0,
    unverifiable_count: 0,
    verify_unavailable: 0,
    error_count: 0,
    errors: [],
    sample_new_bills: [],
  };

  const pushError = (message: string) => {
    stats.error_count += 1;
    if (stats.errors.length < ERROR_PREVIEW_LIMIT) stats.errors.push(message);
  };

  const phrases = getSearchPhrases();
  const pagesPerPhrase = getSearchPagesPerPhrase();
  const minRelevance = getSearchMinRelevance();
  const cooldownSeconds = getSearchCooldownSeconds();
  const delayMs = getSearchDelayMs();
  const maxCallsPerRun = getSearchMaxCallsPerRun();
  const candidates = new Map<number, BillSeedRow>();

  let callsMade = 0;

  phraseLoop:
  for (const phrase of phrases) {
    if (Date.now() >= options.stopAt - DEADLINE_GUARD_MS) break;

    let queriedPhrase = false;
    let pageTotal = 1;

    for (let page = 1; page <= Math.min(pagesPerPhrase, pageTotal); page += 1) {
      if (Date.now() >= options.stopAt - DEADLINE_GUARD_MS) break;

      if (callsMade >= maxCallsPerRun) {
        stats.aborted = "max_calls_per_run";
        break phraseLoop;
      }

      const reservation = await reserveLegiScanCall(
        supabaseAdmin,
        "getSearch",
        `${options.state}:${options.sessionId}:${phrase}:p${page}`,
        cooldownSeconds,
      );

      if (!reservation.allowed) {
        stats.pages_skipped_by_guardrails += 1;
        break;
      }

      // Throttle: LegiScan locks keys for bursty traffic.
      if (callsMade > 0) await delay(delayMs);
      callsMade += 1;

      const searchUrl = `https://api.legiscan.com/?key=${legiscanApiKey}` +
        `&op=getSearch&id=${options.sessionId}` +
        `&query=${encodeURIComponent(`"${phrase}"`)}&page=${page}`;

      try {
        const response = await fetch(searchUrl, {
          headers: LEGISCAN_API_HEADERS,
        });
        const json = await response.json();

        if (json?.status !== "OK" || !json?.searchresult) {
          // An API-level error (locked key, exhausted quota, malformed query)
          // will repeat for every remaining phrase. Stop the whole sweep rather
          // than issuing another dozen doomed requests.
          stats.aborted = "legiscan_error";
          stats.abort_message = toNullableString(json?.alert?.message) ??
            `LegiScan getSearch returned ${json?.status ?? response.status}`;
          pushError(`${phrase} (page ${page}): ${stats.abort_message}`);
          break phraseLoop;
        }

        stats.pages_fetched += 1;
        if (!queriedPhrase) {
          queriedPhrase = true;
          stats.phrases_queried += 1;
        }

        const searchResult = json.searchresult as Record<string, unknown>;
        const summary = (searchResult.summary ?? {}) as Record<string, unknown>;
        pageTotal = Math.max(1, toNullableInt(summary.page_total) ?? 1);

        for (const [key, value] of Object.entries(searchResult)) {
          if (key === "summary" || !value || typeof value !== "object") {
            continue;
          }

          const result = value as Record<string, unknown>;
          stats.results_seen += 1;

          const relevance = toNullableInt(result.relevance) ?? 0;
          if (relevance < minRelevance) continue;

          const billId = parseBillId(result.bill_id);
          const billNumber = toNullableString(result.bill_number);
          const title = toNullableString(result.title);
          if (!billId || !billNumber || !title) continue;

          if (!candidates.has(billId)) {
            candidates.set(billId, {
              id: billId,
              bill_number: billNumber,
              title,
              description: null,
              status: null,
              state_link: buildCaStateLink(
                billNumber,
                options.yearStart,
                options.yearEnd,
              ),
              change_hash: toNullableString(result.change_hash),
              summary_simple: null,
            });
          }
        }
      } catch (error) {
        pushError(
          `${phrase} (page ${page}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        break;
      }
    }
  }

  stats.candidate_bills = candidates.size;

  // Candidates are queued rather than inserted directly: verification costs a
  // leginfo fetch per bill, so it is metered across runs while the search sweep
  // (which is rate-limited by LegiScan) runs at its own pace.
  const queueKey = pendingKey(options.state, options.sessionId);
  const pending = await getPendingState(supabaseAdmin, queueKey);
  const rejected = new Set<number>(pending.rejected);
  const queued = new Map<number, BillSeedRow>(
    pending.rows.map((row) => [row.id, row]),
  );

  const newCandidates = Array.from(candidates.values()).filter(
    (row) => !rejected.has(row.id) && !queued.has(row.id),
  );

  const existingIds = await selectExistingBillIds(
    supabaseAdmin,
    Array.from(
      new Set([...newCandidates.map((r) => r.id), ...queued.keys()]),
    ),
  );

  for (const row of newCandidates) {
    if (!existingIds.has(row.id)) queued.set(row.id, row);
  }
  // Anything already imported (by the dataset pass or a previous run) leaves
  // the queue.
  for (const id of existingIds) queued.delete(id);

  const queue = Array.from(queued.values());
  stats.new_bills = queue.length;
  stats.pending_queue_size = queue.length;
  stats.sample_new_bills = queue.slice(0, ERROR_PREVIEW_LIMIT).map((row) => ({
    id: row.id,
    bill_number: row.bill_number,
    title: row.title,
  }));

  if (options.dryRun) return stats;

  const verifyPerRun = getVerifyPerRun();
  const verifyDelayMs = getVerifyDelayMs();
  const maxNewBills = getSearchMaxNewBills();

  const verifyRegex = buildVerifyRegex(phrases);
  const verified: BillSeedRow[] = [];
  const deferred: BillSeedRow[] = [];
  let index = 0;

  for (; index < queue.length; index += 1) {
    if (stats.verify_attempted >= verifyPerRun) break;
    if (Date.now() >= options.stopAt - DEADLINE_GUARD_MS) break;
    if (verified.length >= maxNewBills) break;

    const row = queue[index];
    if (stats.verify_attempted > 0) await delay(verifyDelayMs);
    stats.verify_attempted += 1;

    const outcome = await billTextMentionsTopic(row.state_link, verifyRegex);

    if (outcome === "unavailable") {
      // Text not published yet, or a transient leginfo failure. Keep it queued
      // and retry on a later run rather than dropping or wrongly admitting it.
      stats.verify_unavailable += 1;
      deferred.push(row);
      continue;
    }

    if (outcome === "match") {
      verified.push(row);
      continue;
    }

    // "rejected" (text has none of the phrases) and "unverifiable" (no usable
    // link, which retrying can never fix) both leave the queue for good.
    stats.rejected_count += 1;
    if (outcome === "unverifiable") stats.unverifiable_count += 1;
    rejected.add(row.id);
  }

  stats.verified_count = verified.length;
  stats.capped = verified.length >= maxNewBills;

  if (verified.length > 0) {
    const insertBatchSize = getUpsertBatchSize();
    for (let i = 0; i < verified.length; i += insertBatchSize) {
      const chunk = verified.slice(i, i + insertBatchSize);
      // Insert-only: existing rows keep their summaries, status and text, which
      // `sync-updated-bills` owns.
      const { error } = await supabaseAdmin
        .from("bills")
        .upsert(chunk, { onConflict: "id", ignoreDuplicates: true });

      if (error) {
        // Requeue rather than drop: these rows already passed verification, and
        // the search sweep that found them is on a multi-hour cooldown, so
        // losing them here would strand them until the phrase is searched again.
        pushError(`insert batch @${i}: ${error.message ?? String(error)}`);
        deferred.push(...chunk);
        continue;
      }

      stats.inserted_count += chunk.length;
    }
  }

  // Everything not resolved this run stays queued, with deferred rows moved to
  // the back so one unreadable bill cannot block the queue.
  const remaining = [...queue.slice(index), ...deferred];
  stats.pending_queue_size = remaining.length;

  await setPendingState(supabaseAdmin, queueKey, {
    rows: remaining,
    rejected: Array.from(rejected),
  });

  return stats;
};

console.log(
  "Initializing bulk-import-dataset v40: full-text discovery + bounded cursor import",
);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!(await isAuthorizedCronOrAdmin(req))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const startedAt = Date.now();

  try {
    const options = await readRequestOptions(req);
    const maxRuntimeMs = getMaxRuntimeMs();
    const stopAt = startedAt + maxRuntimeMs;

    const legiscanApiKey = Deno.env.get("LEGISCAN_API_KEY");
    if (!legiscanApiKey) throw new Error("LEGISCAN_API_KEY is not set.");

    const supabaseAdmin = createClient(
      ensureEnv("SUPABASE_URL"),
      getServiceKey(),
    );

    const state = "CA";
    const legiscanCalls: LegiScanReservation[] = [];
    const datasetListCooldownSeconds = getDatasetListCooldownSeconds();
    const datasetListCache = await getDatasetListCache(supabaseAdmin, state);
    let datasetListSource = "api";
    let datasetList: LegiScanDataset[];

    if (
      !options.force_restart &&
      datasetListCache &&
      isCacheFresh(datasetListCache.updated_at, datasetListCooldownSeconds)
    ) {
      datasetListSource = "cache";
      datasetList = datasetListCache.datasetlist;
    } else {
      const reservation = await reserveLegiScanCall(
        supabaseAdmin,
        "getDatasetList",
        state,
        datasetListCooldownSeconds,
      );
      legiscanCalls.push(reservation);

      if (!reservation.allowed) {
        return jsonResponse({
          message:
            "Skipped LegiScan dataset list call because API guardrails denied the request.",
          skipped_download: true,
          legiscan: {
            dataset_list_source: "denied",
            calls: legiscanCalls,
          },
          continuation: {
            has_more: false,
            next_index: null,
            total_files: null,
          },
        });
      }

      const datasetListUrl =
        `https://api.legiscan.com/?key=${legiscanApiKey}&op=getDatasetList&state=${state}`;

      const datasetListResponse = await fetch(datasetListUrl, {
        headers: LEGISCAN_API_HEADERS,
      });
      const datasetListJson = await datasetListResponse.json();

      if (datasetListJson.status !== "OK") {
        throw new Error("Failed to get dataset list.");
      }

      datasetList = datasetListJson.datasetlist ?? [];
      await setDatasetListCache(supabaseAdmin, state, datasetList);
    }

    const activeDataset = datasetList.find(
      (dataset: LegiScanDataset) => Number(dataset.prior) === 0,
    ) as LegiScanDataset | undefined;

    if (!activeDataset) throw new Error("Could not find an active session.");

    const sessionId = Number(activeDataset.session_id);
    if (!Number.isSafeInteger(sessionId) || sessionId <= 0) {
      throw new Error("Active dataset session_id is invalid.");
    }

    const accessKey = activeDataset.access_key;
    if (!accessKey) throw new Error("Active dataset access_key is missing.");

    // Full-text discovery runs first and commits its own rows, so a later
    // failure in the (much heavier) dataset pass cannot discard it.
    const searchDiscovery: SearchDiscoveryStats | { enabled: false } =
      options.skip_search || !searchDiscoveryEnabled()
        ? { enabled: false }
        : await runSearchDiscovery(supabaseAdmin, legiscanApiKey, {
          sessionId,
          state,
          yearStart: toNullableInt(activeDataset.year_start),
          yearEnd: toNullableInt(activeDataset.year_end),
          dryRun: options.dry_run,
          stopAt,
        });

    // Newly discovered bills carry metadata only; `sync-updated-bills` fetches
    // their text and summaries. Enqueue here so discovery still drives the
    // downstream pipeline on the (now common) runs where the dataset pass is
    // skipped.
    const discoverySummarySync = "inserted_count" in searchDiscovery &&
        searchDiscovery.inserted_count > 0
      ? await enqueueSummarySyncs(
        supabaseAdmin,
        getSummarySyncInvocationCount(searchDiscovery.inserted_count),
      )
      : null;

    const respond = (body: Record<string, unknown>, status = 200) =>
      jsonResponse({
        ...body,
        search_discovery: searchDiscovery,
        discovery_summary_sync: discoverySummarySync,
      }, status);

    const datasetHash = activeDataset.dataset_hash ?? null;
    const datasetSize = toNullableInt(activeDataset.dataset_size);
    const cursorKey = buildCursorKey(state, sessionId);

    const existingCursor = options.force_restart
      ? null
      : await getCursor(supabaseAdmin, cursorKey);

    const sameCursorDataset = Boolean(datasetHash) &&
      existingCursor?.session_id === sessionId &&
      existingCursor?.state === state &&
      existingCursor?.dataset_hash === datasetHash;

    if (
      !options.force_restart && sameCursorDataset &&
      existingCursor?.completed_at
    ) {
      const summarySync = await enqueueSummarySyncs(
        supabaseAdmin,
        getSummarySyncInvocationCount(0),
      );
      return respond({
        message:
          "Dataset cursor already completed for active session hash. Skipping dataset download.",
        session_id: sessionId,
        cursor_key: cursorKey,
        dataset_hash_present: true,
        skipped_download: true,
        legiscan: {
          dataset_list_source: datasetListSource,
          calls: legiscanCalls,
        },
        continuation: {
          has_more: false,
          next_index: existingCursor.next_index ?? 0,
          total_files: existingCursor.total_files ?? 0,
        },
        summary_sync: summarySync,
      });
    }

    if (options.skip_dataset || !datasetPassEnabled()) {
      return respond({
        message: "Dataset pass disabled; full-text discovery only.",
        session_id: sessionId,
        cursor_key: cursorKey,
        dataset_hash_present: Boolean(datasetHash),
        skipped_download: true,
        legiscan: {
          dataset_list_source: datasetListSource,
          calls: legiscanCalls,
        },
        continuation: {
          has_more: false,
          next_index: existingCursor?.next_index ?? 0,
          total_files: existingCursor?.total_files ?? 0,
        },
      });
    }

    const maxDatasetBytes = getMaxDatasetBytes();
    if (datasetSize !== null && datasetSize > maxDatasetBytes) {
      // Downloading and base64-decoding a snapshot this large terminates the
      // worker before the cursor can be written, so the pass would never
      // advance and the LegiScan call would be spent for nothing.
      return respond({
        message:
          "Skipped LegiScan dataset download because the snapshot exceeds the Edge Function size budget.",
        session_id: sessionId,
        cursor_key: cursorKey,
        dataset_hash_present: Boolean(datasetHash),
        skipped_download: true,
        dataset_size: datasetSize,
        max_dataset_bytes: maxDatasetBytes,
        legiscan: {
          dataset_list_source: datasetListSource,
          calls: legiscanCalls,
        },
        continuation: {
          has_more: true,
          next_index: existingCursor?.next_index ?? 0,
          total_files: existingCursor?.total_files ?? 0,
        },
      });
    }

    if (Date.now() >= stopAt - DEADLINE_GUARD_MS) {
      return respond({
        message:
          "Runtime budget reached before dataset download; invoke again to continue.",
        session_id: sessionId,
        cursor_key: cursorKey,
        dataset_hash_present: Boolean(datasetHash),
        skipped_download: true,
        legiscan: {
          dataset_list_source: datasetListSource,
          calls: legiscanCalls,
        },
        continuation: {
          has_more: true,
          next_index: existingCursor?.next_index ?? 0,
          total_files: existingCursor?.total_files ?? 0,
        },
      });
    }

    // A partially-walked cursor needs to re-download the same snapshot on the
    // next invocation, so the weekly cooldown only applies once a pass has
    // finished. The daily/monthly LegiScan budgets still bound the total.
    const passInProgress = existingCursor?.session_id === sessionId &&
      existingCursor?.state === state &&
      !existingCursor?.completed_at;

    const datasetReservation = await reserveLegiScanCall(
      supabaseAdmin,
      "getDataset",
      `${state}:${sessionId}:${datasetHash ?? "no-hash"}`,
      passInProgress
        ? getDatasetResumeCooldownSeconds()
        : getDatasetCooldownSeconds(),
    );
    legiscanCalls.push(datasetReservation);

    if (!datasetReservation.allowed) {
      return respond({
        message:
          "Skipped LegiScan dataset download because API guardrails denied the request.",
        session_id: sessionId,
        cursor_key: cursorKey,
        dataset_hash_present: Boolean(datasetHash),
        skipped_download: true,
        legiscan: {
          dataset_list_source: datasetListSource,
          calls: legiscanCalls,
        },
        continuation: {
          has_more: true,
          next_index: existingCursor?.next_index ?? 0,
          total_files: existingCursor?.total_files ?? 0,
        },
      });
    }

    const legiscanUrl =
      `https://api.legiscan.com/?op=getDataset&id=${sessionId}&key=${legiscanApiKey}&access_key=${accessKey}`;

    const legiscanResponse = await fetch(legiscanUrl, {
      headers: LEGISCAN_API_HEADERS,
    });
    const legiscanJson = await legiscanResponse.json();

    if (!legiscanJson?.dataset?.zip) {
      throw new Error("No dataset.zip property found.");
    }

    const zip = await new JSZip().loadAsync(legiscanJson.dataset.zip, {
      base64: true,
    });

    const billFiles = Object.values(zip.files)
      .filter((file) => file.name.includes("/bill/") && !file.dir)
      .sort((a, b) => a.name.localeCompare(b.name));

    const totalFiles = billFiles.length;
    const nowIso = new Date().toISOString();

    // Resume an unfinished pass even when the snapshot hash moved on. LegiScan
    // republishes the dataset roughly weekly, so keying resumption on the hash
    // restarted the walk at index 0 every week and the cursor never advanced
    // past the first batch. Files are name-sorted, so the index stays a valid
    // position across snapshots, and every upsert is idempotent.
    const sameSession = existingCursor?.session_id === sessionId &&
      existingCursor?.state === state;

    const resumePass = sameSession && !existingCursor?.completed_at;

    const startIndex = resumePass
      ? Math.max(0, Math.min(existingCursor?.next_index ?? 0, totalFiles))
      : 0;

    if (totalFiles === 0) {
      const cursor: CursorState = {
        session_id: sessionId,
        state,
        dataset_hash: datasetHash,
        next_index: 0,
        total_files: 0,
        completed_at: nowIso,
        updated_at: nowIso,
      };

      await setCursor(supabaseAdmin, cursorKey, cursor);

      return respond({
        message: "No bill files found in dataset.",
        session_id: sessionId,
        cursor_key: cursorKey,
        processed_files: 0,
        matched_bills: 0,
        inserted_count: 0,
        updated_count: 0,
        skipped_count: 0,
        error_count: 0,
        continuation: {
          has_more: false,
          next_index: 0,
          total_files: 0,
        },
        legiscan: {
          dataset_list_source: datasetListSource,
          calls: legiscanCalls,
        },
      });
    }

    if (resumePass && startIndex >= totalFiles && !options.force_restart) {
      // Reachable when a newer snapshot carries fewer bill files than the one
      // the cursor was walking. Close the pass out so the next snapshot starts
      // a fresh walk instead of re-entering this branch forever.
      await setCursor(supabaseAdmin, cursorKey, {
        session_id: sessionId,
        state,
        dataset_hash: datasetHash,
        next_index: startIndex,
        total_files: totalFiles,
        completed_at: nowIso,
        updated_at: nowIso,
      });

      const summarySync = await enqueueSummarySyncs(
        supabaseAdmin,
        getSummarySyncInvocationCount(0),
      );
      return respond({
        message: "Dataset already fully processed for current cursor.",
        session_id: sessionId,
        cursor_key: cursorKey,
        processed_files: 0,
        matched_bills: 0,
        inserted_count: 0,
        updated_count: 0,
        skipped_count: 0,
        error_count: 0,
        continuation: {
          has_more: false,
          next_index: startIndex,
          total_files: totalFiles,
        },
        summary_sync: summarySync,
        legiscan: {
          dataset_list_source: datasetListSource,
          calls: legiscanCalls,
        },
      });
    }

    const stats: BatchStats = {
      processed_files: 0,
      matched_bills: 0,
      inserted_count: 0,
      updated_count: 0,
      skipped_count: 0,
      error_count: 0,
      errors: [],
    };

    const pendingRows: BillSeedRow[] = [];
    const upsertBatchSize = getUpsertBatchSize();

    let nextIndex = startIndex;

    for (
      let i = startIndex;
      i < totalFiles && stats.processed_files < options.max_files;
      i += 1
    ) {
      if (Date.now() >= stopAt - DEADLINE_GUARD_MS) break;

      const file = billFiles[i];
      nextIndex = i + 1;
      stats.processed_files += 1;

      try {
        const billJsonText = await file.async("text");
        const { bill: billData } = JSON.parse(billJsonText);

        const billId = parseBillId(billData?.bill_id);
        const title = toNullableString(billData?.title);

        if (!billId || !title || !KEYWORD_REGEX.test(title)) {
          stats.skipped_count += 1;
          continue;
        }

        pendingRows.push({
          id: billId,
          bill_number: toNullableString(billData?.bill_number) ?? "",
          title,
          description: toNullableString(billData?.description),
          status: toNullableString(billData?.status),
          state_link: toNullableString(billData?.state_link),
          change_hash: toNullableString(billData?.change_hash),
          summary_simple: null,
        });

        stats.matched_bills += 1;

        if (pendingRows.length >= upsertBatchSize) {
          if (Date.now() >= stopAt - DEADLINE_GUARD_MS) break;
          const result = await flushUpsertBatch(
            supabaseAdmin,
            pendingRows.splice(0, pendingRows.length),
          );

          stats.inserted_count += result.inserted;
          stats.updated_count += result.updated;
        }
      } catch (error) {
        stats.error_count += 1;
        stats.skipped_count += 1;

        if (stats.errors.length < ERROR_PREVIEW_LIMIT) {
          stats.errors.push({
            file: file.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        console.error(
          "Skipping bill file due to error:",
          file.name,
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    if (pendingRows.length > 0) {
      const result = await flushUpsertBatch(supabaseAdmin, pendingRows);
      stats.inserted_count += result.inserted;
      stats.updated_count += result.updated;
    }

    const hasMore = nextIndex < totalFiles;
    const completedAt = hasMore ? null : new Date().toISOString();

    await setCursor(supabaseAdmin, cursorKey, {
      session_id: sessionId,
      state,
      dataset_hash: datasetHash,
      next_index: nextIndex,
      total_files: totalFiles,
      completed_at: completedAt,
      updated_at: new Date().toISOString(),
    });

    const summarySyncCandidateCount = stats.inserted_count +
      stats.updated_count;
    const summarySync = await enqueueSummarySyncs(
      supabaseAdmin,
      getSummarySyncInvocationCount(summarySyncCandidateCount),
    );

    return respond({
      message: hasMore
        ? "Processed bounded dataset batch. Invoke again to continue."
        : "Bulk import completed for active dataset cursor.",
      session_id: sessionId,
      cursor_key: cursorKey,
      dataset_hash_present: Boolean(datasetHash),
      max_files: options.max_files,
      runtime_ms: Date.now() - startedAt,
      ...stats,
      continuation: {
        has_more: hasMore,
        next_index: nextIndex,
        total_files: totalFiles,
      },
      summary_sync: summarySync,
      legiscan: {
        dataset_list_source: datasetListSource,
        calls: legiscanCalls,
      },
    });
  } catch (error) {
    console.error("Critical error in bulk-import-dataset:", error);

    let message = "Unknown error";
    let stack = undefined;
    let details = error;

    if (error instanceof Error) {
      message = error.message;
      stack = error.stack;
    } else if (typeof error === "string") {
      message = error;
    } else {
      try {
        message = JSON.stringify(error);
      } catch {
        message = String(error);
      }
    }

    return jsonResponse({
      error: message,
      stack,
      details,
    }, 500);
  }
});
