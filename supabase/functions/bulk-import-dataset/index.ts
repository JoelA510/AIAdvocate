// supabase/functions/bulk-import-dataset/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip";
import { ensureEnv, isPlaceholder } from "../_shared/utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "600",
};

const BROWSER_HEADERS = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  Connection: "keep-alive",
  Host: "api.legiscan.com",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
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
const DEFAULT_FILES_PER_INVOCATION = 75;
const MAX_FILES_PER_INVOCATION = 250;
const UPSERT_BATCH_SIZE = 75;
const ERROR_PREVIEW_LIMIT = 10;
const DEFAULT_MAX_RUNTIME_MS = 22_000;
const HARD_MAX_RUNTIME_MS = 28_000;

type SupabaseAdminClient = ReturnType<typeof createClient>;

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

const preserveExistingSummary = (value: string | null | undefined): boolean => {
  if (!value) return false;

  const normalized = value.trim();
  if (!normalized) return false;
  if (isPlaceholder(normalized)) return false;
  if (/^AI_SUMMARY_FAILED/i.test(normalized)) return false;

  return true;
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
  const maxFilesFromBody = typeof body?.max_files === "number" || typeof body?.max_files === "string"
    ? body.max_files
    : undefined;
  const maxFilesFromEnv = Deno.env.get("BULK_IMPORT_MAX_FILES_PER_INVOCATION");

  const maxFiles = parsePositiveInt(
    maxFilesFromQuery ?? maxFilesFromBody ?? maxFilesFromEnv,
    DEFAULT_FILES_PER_INVOCATION,
    MAX_FILES_PER_INVOCATION,
  );

  const forceRestart =
    url.searchParams.get("force_restart") === "1" ||
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

const flushUpsertBatch = async (
  supabaseAdmin: SupabaseAdminClient,
  rows: BillSeedRow[],
): Promise<{ inserted: number; updated: number }> => {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  const dedupedRows = Array.from(
    rows.reduce((map, row) => map.set(row.id, row), new Map<number, BillSeedRow>()).values(),
  );

  const billIds = dedupedRows.map((bill) => bill.id);

  const { data: existingRows, error: existingError } = await supabaseAdmin
    .from("bills")
    .select("id, summary_simple")
    .in("id", billIds);

  if (existingError) throw existingError;

  const existingIdSet = new Set<number>();
  const existingSummaryMap = new Map<number, string>();

  (existingRows ?? []).forEach((row: { id: number; summary_simple: string | null }) => {
    existingIdSet.add(row.id);
    if (preserveExistingSummary(row.summary_simple)) {
      existingSummaryMap.set(row.id, row.summary_simple);
    }
  });

  dedupedRows.forEach((bill) => {
    const existingSummary = existingSummaryMap.get(bill.id);
    if (existingSummary) {
      bill.summary_simple = existingSummary;
    }
  });

  const { error } = await supabaseAdmin
    .from("bills")
    .upsert(dedupedRows, { onConflict: "id" });

  if (error) throw error;

  const updated = dedupedRows.filter((row) => existingIdSet.has(row.id)).length;
  const inserted = dedupedRows.length - updated;

  return { inserted, updated };
};

console.log("Initializing bulk-import-dataset v39 bounded cursor import");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
      ensureEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const state = "CA";
    const datasetListUrl =
      `https://api.legiscan.com/?key=${legiscanApiKey}&op=getDatasetList&state=${state}`;

    const datasetListResponse = await fetch(datasetListUrl, { headers: BROWSER_HEADERS });
    const datasetListJson = await datasetListResponse.json();

    if (datasetListJson.status !== "OK") {
      throw new Error("Failed to get dataset list.");
    }

    const activeDataset = (datasetListJson.datasetlist ?? []).find(
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

    const legiscanUrl =
      `https://api.legiscan.com/?op=getDataset&id=${sessionId}&key=${legiscanApiKey}&access_key=${accessKey}`;

    const legiscanResponse = await fetch(legiscanUrl, { headers: BROWSER_HEADERS });
    const legiscanJson = await legiscanResponse.json();

    if (!legiscanJson?.dataset?.zip) {
      throw new Error("No dataset.zip property found.");
    }

    const zip = await new JSZip().loadAsync(legiscanJson.dataset.zip, { base64: true });

    const billFiles = Object.values(zip.files)
      .filter((file) => file.name.includes("/bill/") && !file.dir)
      .sort((a, b) => a.name.localeCompare(b.name));

    const totalFiles = billFiles.length;
    const nowIso = new Date().toISOString();

    const existingCursor = options.force_restart ? null : await getCursor(supabaseAdmin, cursorKey);

    const sameDataset =
      existingCursor?.session_id === sessionId &&
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
      });
    }

    if (sameDataset && startIndex >= totalFiles && !options.force_restart) {
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

    let nextIndex = startIndex;

    for (
      let i = startIndex;
      i < totalFiles && stats.processed_files < options.max_files;
      i += 1
    ) {
      if (Date.now() >= stopAt) break;

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

        if (pendingRows.length >= UPSERT_BATCH_SIZE) {
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
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    console.error("Function failed:", message);

    return jsonResponse({ error: message }, 500);
  }
});
