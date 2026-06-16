// supabase/functions/bulk-import-dataset/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip";
import { ensureEnv, getServiceKey } from "../_shared/utils.ts";
import { corsHeaders } from "../_shared/cors.ts";

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

const CURSOR_KEY_PREFIX = "bulk_import_dataset";
const DEFAULT_FILES_PER_INVOCATION = 10000;
const MAX_FILES_PER_INVOCATION = 10000;
const DEFAULT_UPSERT_BATCH_SIZE = 40;
const MAX_UPSERT_BATCH_SIZE = 100;
const ERROR_PREVIEW_LIMIT = 10;
const DEFAULT_MAX_RUNTIME_MS = 18_000;
const HARD_MAX_RUNTIME_MS = 26_000;
const DEADLINE_GUARD_MS = 1_250;
const DATASET_LIST_CACHE_KEY_PREFIX = "legiscan_dataset_list";

type SupabaseAdminClient = any;

type LegiScanDataset = {
  prior: number;
  session_id: number | string;
  access_key: string;
  session_title?: string;
  dataset_hash?: string;
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

  const forceRestart = url.searchParams.get("force_restart") === "1" ||
    url.searchParams.get("force_restart") === "true" ||
    body?.force_restart === true;

  return {
    force_restart: forceRestart,
    max_files: maxFiles,
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

console.log("Initializing bulk-import-dataset v39 bounded cursor import");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
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

    const datasetHash = activeDataset.dataset_hash ?? null;
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
      return jsonResponse({
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

    if (Date.now() >= stopAt - DEADLINE_GUARD_MS) {
      return jsonResponse({
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

    const datasetReservation = await reserveLegiScanCall(
      supabaseAdmin,
      "getDataset",
      `${state}:${sessionId}:${datasetHash ?? "no-hash"}`,
      getDatasetCooldownSeconds(),
    );
    legiscanCalls.push(datasetReservation);

    if (!datasetReservation.allowed) {
      return jsonResponse({
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

    const sameDataset = existingCursor?.session_id === sessionId &&
      existingCursor?.state === state &&
      (
        datasetHash
          ? existingCursor.dataset_hash === datasetHash
          : existingCursor.total_files === totalFiles
      );

    const startIndex = sameDataset
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

      return jsonResponse({
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

    if (sameDataset && startIndex >= totalFiles && !options.force_restart) {
      const summarySync = await enqueueSummarySyncs(
        supabaseAdmin,
        getSummarySyncInvocationCount(0),
      );
      return jsonResponse({
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

    return jsonResponse({
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
