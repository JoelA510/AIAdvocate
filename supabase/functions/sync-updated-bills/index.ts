// supabase/functions/sync-updated-bills/index.ts
// VERSION 3.0: Bilingual summaries, batching, and embedding updates

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom/deno-dom-wasm.ts";

import { corsHeaders } from "../_shared/cors.ts";
import { getOptionalOpenAiKey, getServiceKey } from "../_shared/utils.ts";

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

// Discovery adds roughly five California bills a day while this defaulted to
// three per daily run, so the unsummarised backlog grew even on days when
// nothing errored. Raised to eight, which is only safe because of the wall
// clock budget below.
const MAX_BILLS_PER_RUN = Math.max(
  0,
  Number.parseInt(Deno.env.get("SYNC_BILLS_PER_RUN") ?? "8", 10) || 0,
);

// The bill loop had no time budget: it ran its iteration count and relied on
// finishing before the platform killed the invocation. Being killed mid-bill is
// worse than stopping early, because the lease taken by lease_next_bill is
// still held and nothing releases it -- that bill is then skipped by every run
// for the remaining 900s of its TTL. Stop leasing new work once the run is
// close to the limit and let the next cron pick up where this one left off.
//
// 110s is sized against the real ceiling, which is 150s, not the 400s that
// Supabase's docs quote first. Two limits bind here and both are 150:
//
//   * Wall clock is 150s on the FREE plan (400s is paid only). This project's
//     organisation is on free -- checked, not assumed.
//   * Request idle timeout is 150s on every plan: a function that has not
//     responded by then returns 504 regardless of how long the worker may live.
//     This function is invoked over HTTP by pg_net and returns a JSON body, so
//     that limit applies even if the plan changed.
//
// With PER_BILL_HEADROOM_MS at 45s, no bill starts after 65s, so the worst
// realistic run is 65s plus one bill -- comfortably inside 150s. Raising the
// budget to fit MAX_BILLS_PER_RUN=8 would push past it and trade a truncated
// run, which rolls over cleanly, for a 504 and a stranded lease. The bills-per-
// run ceiling is deliberately higher than the clock usually reaches: it costs
// nothing when the clock binds first and is there for the runs where bills are
// quick. Revisit on a paid plan, and only against measured per-bill durations.
const RUN_TIME_BUDGET_MS = Math.max(
  10_000,
  Number.parseInt(Deno.env.get("SYNC_RUN_TIME_BUDGET_MS") ?? "110000", 10) ||
    110_000,
);

// `parseInt(x) || fallback` cannot express a configured zero: parseInt("0")
// returns 0, which is falsy, so the fallback wins. Both reserves below are
// legitimately settable to 0 -- that is how you turn a reserve off -- so they
// need a parse that distinguishes "not a number" from "zero".
const envMillis = (name: string, fallback: number): number => {
  const raw = Deno.env.get(name);
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

// Headroom held back from RUN_TIME_BUDGET_MS so the last bill a run starts can
// still finish inside the budget. A single bill can legitimately take a while:
// fetchJsonWithRetries allows 3 attempts at a 45s abort plus backoff, and a
// bill makes several such calls. This does not cap an already-running bill --
// nothing here can -- it just stops the loop handing out work it has no time
// left to finish.
const PER_BILL_HEADROOM_MS = envMillis("SYNC_PER_BILL_HEADROOM_MS", 45_000);

// The point in the run after which no further bill is leased. Clamped to leave
// at least one second of leasing window, because the two inputs are configured
// independently and nothing stops the headroom exceeding the budget:
// SYNC_RUN_TIME_BUDGET_MS=30000 against the default 45s headroom yields -15000,
// the loop breaks at iteration 0 forever, and the function cheerfully returns
// HTTP 200 saying it stopped on the run time budget. A total, silent halt of
// ingestion that looks like a healthy run is far worse than a run that
// overshoots its headroom, so when the two are in conflict, leasing wins.
const LEASE_CUTOFF_MS = Math.max(
  1_000,
  RUN_TIME_BUDGET_MS - PER_BILL_HEADROOM_MS,
);

// Time that must remain in the run budget before a summariser re-ask is worth
// starting. A re-ask is a whole additional withRetries round, so it needs its
// own reserve rather than riding on PER_BILL_HEADROOM_MS.
//
// It is deliberately checked ALONE, not added to PER_BILL_HEADROOM_MS. That
// headroom is the outer loop's reserve for letting an in-flight bill finish;
// once we are inside a bill we are already spending it, and adding it again
// double-counts. With both defaults at 45s the summed form required 90s of a
// 110s budget to remain -- i.e. elapsed <= 20s -- while the loop itself only
// starts a bill at elapsed < 65s, and by the re-ask decision that bill has
// already paid for a lease, a LegiScan fetch, a leginfo scrape and a full
// summariser round. The gate was therefore false in essentially every real run
// and the re-ask never fired.
//
// This does not make an overrun impossible: a round that hits repeated timeouts
// can exceed any fixed reserve. It makes the re-ask decline itself when an
// overrun is likely, rather than in every case or in none.
const SUMMARY_REASK_RESERVE_MS = envMillis("SYNC_REASK_RESERVE_MS", 45_000);
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
// Quality targets, not validity thresholds. They decide what the prompt asks
// for and whether a re-ask fires; they are NOT what decides that a summary is
// unusable. See SUMMARY_HARD_FLOOR_CHARS.
const MIN_SUMMARY_LENGTHS = {
  simple: 200,
  medium: 400,
  complex: 600,
};

// The floor a summary must clear to be stored at all.
//
// These two thresholds were the same number until it became clear they are
// answering different questions. MIN_SUMMARY_LENGTHS asks "is this as thorough
// as we want?"; this asks "is this output broken?". Conflating them is a trap,
// because the prompt now (correctly) tells the model that a short bill should
// get a shorter, accurate summary rather than a padded one -- so a model that
// obeys us produces output that a hard MIN_SUMMARY_LENGTHS check throws on. The
// bill then fails, gets re-leased, and fails identically on every subsequent
// cron run, because nothing about the next attempt differs. That is the same
// never-converging loop the re-ask was added to break, re-entered through the
// validator instead.
//
// So: below this, the generation is broken and we throw. Between this and
// MIN_SUMMARY_LENGTHS, we have already spent a re-ask trying to do better, and
// storing a short-but-accurate summary beats showing a survivor nothing at all
// -- we log and accept.
//
// 120 is chosen to sit well clear of the 40-character threshold in
// lease_next_bill's requeue predicate. Anything we accept here must be long
// enough that the database does not immediately hand the bill back, or the loop
// simply moves down a layer.
const SUMMARY_HARD_FLOOR_CHARS = 120;

// toAscii() runs on the model's output before the floors are checked and
// usually shortens it: diacritics stripped, any non-ASCII run collapsed to one
// space, whitespace collapsed, trimmed. (NFKD can expand a few characters --
// "…" becomes "..." -- so it is not strictly monotonic, but the common
// direction is down.) A response landing exactly on a floor can normalise to
// just under it and be rejected, so ask for a margin: the floor should be what
// survives normalisation, not what the model aimed at.
const SUMMARY_LENGTH_TARGET_MARGIN = 1.15;
const summaryTarget = (floor: number): number =>
  Math.ceil(floor * SUMMARY_LENGTH_TARGET_MARGIN);
const asciiGuard = /[^ -~\n]/;

// These mirror lease_next_bill's requeue predicate and release_bill_lease's
// success predicate. They must be at least as strict as the SQL, because the
// database is the authority on whether a summary counts: anything this code
// accepts and the database rejects is stored with summary_ok flipped straight
// back to false, re-leased on the next run, and re-summarised forever.
//
// The prefix test used to be /^error[:\s]/i, which requires a colon or space
// after "error" -- narrower than the SQL's '^[[:space:]]*(error|placeholder)',
// which has no such boundary. A summary opening "Errors under this act..."
// passed here and failed there, which is that loop exactly. Widened to match.
// It will occasionally reject a legitimate summary that happens to open with
// the word "Errors", but the alternative is not storing it either -- just
// storing it and re-doing it every night.
const invalidSummaryPrefix = /^\s*(error|placeholder)/i;
const invalidSummaryPlaceholder = /placeholder/i;
// Mirrors "NOT ILIKE 'AI_SUMMARY_FAILED%'" in both SQL predicates. Nothing on
// this side checked for it, so a failure marker written by an older code path
// would have been treated as a valid summary here and rejected by the database.
const invalidSummaryFailedMarker = /^\s*ai_summary_failed/i;

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
  if (invalidSummaryFailedMarker.test(trimmed)) return false;
  return true;
};

// Spanish's equivalent of SUMMARY_HARD_FLOOR_CHARS: the line between "the
// translation did not happen" and "the translation is shorter than we would
// like". Below this we warn; failing isUsableSpanishSummary we throw.
//
// Spanish deliberately has no length TARGET. Its levels are translations of
// English levels that have already been held to MIN_SUMMARY_LENGTHS, so their
// length is inherited rather than independently steered, and imposing a second
// floor here would fail bills for the model's word choice in another language.
const MIN_SPANISH_SUMMARY_CHARS = 40;

// Presence and sanity only -- no length test. isValidSummary's 40-character
// minimum is right for an English summary that must stand on its own and wrong
// as a reason to throw away a whole bill's work.
const isUsableSpanishSummary = (value?: string | null): boolean => {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (invalidSummaryPrefix.test(trimmed)) return false;
  if (invalidSummaryPlaceholder.test(trimmed)) return false;
  if (invalidSummaryFailedMarker.test(trimmed)) return false;
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
  //
  // DOMParser here is the same construct that OOMed the leginfo scrape: it
  // materialises a full node tree and then walks it recursively, which costs
  // multiples of the source size and has no ceiling of its own. The scrape was
  // rewritten to strings; this path was not, and it matters more now than it
  // did, because extractLeginfoBillText's "refuse rather than truncate" branch
  // deliberately routes the LARGEST documents to the LegiScan getBillText
  // fallback -- whose payload is HTML and lands right here. The one case the
  // ceiling exists to protect would have been handed straight to the hazard.
  //
  // Above the threshold, fall back to the string pipeline the scrape uses. It
  // loses some of the block-level niceties below (table pipes, list bullets)
  // but preserves paragraph structure, and a slightly plainer rendering of a
  // huge bill beats a killed isolate and a lease stranded for its 900s TTL.
  const trimmedRaw = working.trim();
  if (trimmedRaw.startsWith("<") && working.length > MAX_DOM_PARSE_CHARS) {
    console.warn("Bill text too large for DOMParser; using string extraction", {
      chars: working.length,
      ceiling: MAX_DOM_PARSE_CHARS,
    });
    working = stripHtmlToText(working);
  } else if (trimmedRaw.startsWith("<")) {
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

// Leginfo pages were previously parsed with deno_dom's DOMParser, which built a
// full DOM for the whole document. That is what actually broke ingestion for
// California's budget bills: their text pages run well over a megabyte, and on
// 2026-08-12 the edge function logs show the sequence
//
//   Processing bill { bill_id: 1908086 }   (AB101, "Budget Act of 2025")
//   - Attempting Leginfo scrape
//   Memory limit exceeded  -> shutdown     (4 seconds later)
//
// The runtime *kills* the isolate, so nothing is thrown and nothing reaches
// cron_job_errors -- which is why this looked like a silent stall rather than a
// failure. AB101's page is 8,077,421 characters, and a DOM of a document that
// size costs many times the source in node objects; the bill text is a flat run
// of markup, so none of that structure is needed.
//
// Extract it with string work instead. On leginfo, `bill_all` is the last
// content block on the page, so everything from the anchor to the end of the
// document is the bill.
//
// This lowers peak memory but does not make it constant, and the difference
// matters: fetch's res.text() still materialises the whole body before any of
// this runs, and the replace chain allocates a few large intermediates on top.
// Measured on the real pages (node, --expose-gc):
//
//   AB101  8,077,421 chars in -> 2,226,761 out, 296 ms, ~48.8 MB heap delta
//   SB857    677,349 chars in ->   489,999 out,  16 ms, ~10.3 MB heap delta
//
// That fits where the DOM did not, but the headroom on AB101 is not enormous.
// If a future bill is materially larger than AB101, revisit this with chunked
// processing rather than raising the ceiling.
// Tolerant of quoting and spacing rather than a byte-exact substring.
// getElementById did not care whether leginfo wrote id="bill_all", id='bill_all'
// or id = bill_all; a literal 'id="bill_all"' search does, and this is the only
// way text reaches the app -- the LegiScan getBillText fallback is gated behind
// SYNC_USE_LEGISCAN, which is off in production. So a purely cosmetic change to
// leginfo's markup would silently stop text extraction for every California
// bill, with nothing behind it. Matching the attribute instead of one rendering
// of it costs nothing and removes that class of failure.
const LEGINFO_ANCHOR_PATTERN = /id\s*=\s*(?:"bill_all"|'bill_all'|bill_all\b)/i;

// Ceiling on the markup considered, as a backstop against a pathological page.
//
// It has to clear real bills: AB101 ("Budget Act of 2025"), the bill whose
// scrape OOMed, is 8,077,421 characters with 8,002,546 after the anchor. An
// earlier revision used 4,000,000 and was "verified" against SB857 (677,873
// chars, comfortably under it) -- which would have silently discarded more than
// half of every budget bill while reporting success.
//
// But it also has to stay BELOW the memory it exists to protect, and 24,000,000
// did not. The extractor was measured at 48.8 MB peak for AB101's 8 M
// characters -- roughly 6 bytes of peak per source character, counting the UTF-16
// page, the slice and the replace-chain intermediates. At 24 M that is ~146 MB
// before the truncation branch's own copies, which is over the edge of a 256 MB
// isolate: a ceiling that high never trips, and the page OOMs exactly as it did
// before. 12 M gives ~48% headroom over the largest bill California has
// produced.
//
// On peak at 12 M: the 6-bytes-per-char figure was measured on an earlier form
// of the pipeline. stripHtmlToText has since added two more full-size
// intermediates (the comment strip and the per-line trim), so the honest
// estimate is nearer 120 MB than the 73 MB a naive scaling gives. Still inside
// a 256 MB isolate with room, and well under what 24 M would have cost, but
// worth stating accurately: this ceiling is sized with roughly a 2x margin, not
// a 3x one.
const LEGINFO_MAX_SLICE_CHARS = 12_000_000;

// Beyond the five XML built-ins plus nbsp, this covers the typographic
// punctuation and legal symbols that appear in statute text. An unlisted entity
// is left as its literal source form rather than dropped, so a gap here degrades
// to a visible "&mdash;" instead of silently losing a character -- but the point
// of the table is that the DOMParser path this replaced decoded all of these,
// and anything missing is a regression against it, not a new limitation.
//
// Probed against a live leginfo bill page: zero named entities outside this set
// appeared in the markup, so this is insurance rather than a fix for something
// observed.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  sect: "§",
  para: "¶",
  middot: "·",
  bull: "•",
  deg: "°",
  times: "×",
  divide: "÷",
  plusmn: "±",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  copy: "©",
  reg: "®",
  trade: "™",
  dagger: "†",
  Dagger: "‡",
  laquo: "«",
  raquo: "»",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
};

// One pass, not a chain of .replace() calls. A chain that decodes &amp; before
// &lt; double-unescapes: "&amp;lt;" becomes "<" instead of the literal "&lt;".
// Matching every entity in a single scan means each one is consumed exactly
// once and its output is never re-examined. Hex forms (&#x2019;) are handled
// too -- leginfo emits them, and the DOMParser path this replaced decoded them.
const HTML_ENTITY = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z]+));/g;

const decodeHtmlEntities = (input: string): string =>
  input.replace(HTML_ENTITY, (match, dec, hex, name) => {
    // Exact case first. HTML named entities are case-sensitive and a few differ
    // only by case -- &dagger; is a dagger, &Dagger; a double dagger. Folding to
    // lowercase unconditionally did not merely fail to handle &Dagger;, it
    // silently decoded it to the wrong character, which is worse than leaving it
    // alone. The lowercase pass is kept as a lenient fallback for sloppy markup
    // (&NBSP;, &AMP;), where there is no ambiguity to get wrong.
    //
    // Object.hasOwn, not a bare index. A plain object literal inherits from
    // Object.prototype, so "&constructor;", "&toString;" and "&valueOf;" all
    // resolved to real values and would be stringified into the stored bill
    // text -- "function Object() { [native code] }" dropped into the middle of
    // a statute -- rather than falling through to the documented passthrough.
    if (name) {
      if (Object.hasOwn(NAMED_ENTITIES, name)) return NAMED_ENTITIES[name];
      const lower = name.toLowerCase();
      if (Object.hasOwn(NAMED_ENTITIES, lower)) return NAMED_ENTITIES[lower];
      return match;
    }
    const code = dec ? Number(dec) : Number.parseInt(hex, 16);
    return Number.isFinite(code) && code > 0 && code < 0x110000
      ? String.fromCodePoint(code)
      : " ";
  });

// \s+ -> " " would flatten the whole bill into one paragraph. textContent
// preserved line structure and the appropriation tables in a budget bill are
// unreadable without it, so map block-level boundaries to newlines before
// stripping the rest, then reuse the file's existing whitespace collapsers.
const SCRIPT_OR_STYLE = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const BLOCK_BOUNDARY =
  /<\/?(?:p|div|br|tr|li|h[1-6]|table|caption|blockquote)\b[^>]*>/gi;
// Comments are removed as whole units before tags are stripped. /<[^>]*>/ stops
// at the FIRST ">", so a comment containing one -- "<!-- note > here -->" --
// had its opening consumed and its tail left behind as literal text in the
// stored bill.
const HTML_COMMENT = /<!--[\s\S]*?-->/g;

// Requires a tag-shaped opening rather than any "<". The permissive form
// deleted everything between a bare "<" in prose and the next ">", so
// "fewer than 5 > the threshold" collapsed to "fewer than the threshold" --
// silently rewriting a statute's meaning. DOMParser, which this replaced,
// treated a bare "<" as text. Also covers doctypes, CDATA and processing
// instructions, which are markup rather than content.
//
// Latent today: the live AB101 page carries no comments and no bare "<" after
// the anchor. Fixed because it is a regression against the path it replaced and
// the failure would be silent and unrecoverable.
const ANY_TAG = /<\/?[a-zA-Z][^>]*>|<!\[CDATA\[[\s\S]*?\]\]>|<[!?][^>]*>/g;

// Markup -> readable text without building a node tree. Shared by the leginfo
// scrape and by formatLegislationText's large-input path, so there is one
// implementation to reason about rather than two that can drift.
const stripHtmlToText = (html: string): string => {
  const text = decodeHtmlEntities(
    html
      .replace(SCRIPT_OR_STYLE, " ")
      .replace(HTML_COMMENT, " ")
      .replace(BLOCK_BOUNDARY, "\n")
      .replace(ANY_TAG, " "),
  );
  // Trim horizontal whitespace off each line BEFORE collapsing newline runs.
  // Without this, collapseNLBlocks is very nearly a no-op here: the preceding
  // collapseSpacesExceptNL turns the indentation between block tags into single
  // spaces, so a run of empty lines arrives as "\n \n \n" and the /\n{3,}/
  // pattern never matches. Measured on a real leginfo page, 38 of 91 output
  // lines were blank for exactly this reason. It is safe because the spaces
  // being removed are indentation that collapseSpacesExceptNL has already
  // flattened to one character, not content.
  const trimmed = collapseSpacesExceptNL(text).replace(/[ \t]*\n[ \t]*/g, "\n");
  return collapseNLBlocks(trimmed).trim();
};

// Ceiling above which formatLegislationText skips DOMParser. Well below the
// 8 M that killed the isolate, and far above any normal LegiScan bill payload,
// so the safe path is reserved for documents that actually threaten the
// isolate rather than becoming the default rendering.
const MAX_DOM_PARSE_CHARS = 500_000;

// Abort for the leginfo scrape. It sits outside withRetries, so it needs its own
// bound; sized like one withRetries attempt because it pulls the largest payload
// in the bill path.
const LEGINFO_FETCH_TIMEOUT_MS = 45_000;

const extractLeginfoBillText = (html: string): string | null => {
  const anchorMatch = LEGINFO_ANCHOR_PATTERN.exec(html);
  if (!anchorMatch) return null;
  const anchor = anchorMatch.index;

  // Start after the opening tag's closing ">", not at the anchor itself --
  // slicing mid-tag leaves the element's remaining attributes as literal text
  // ('id="bill_all" align="justify">') at the head of the bill.
  const tagEnd = html.indexOf(">", anchor);
  const start = tagEnd === -1 ? anchor + anchorMatch[0].length : tagEnd + 1;

  const available = html.length - start;

  // Refuse rather than truncate.
  //
  // Storing a partial bill here was silently destructive. The caller cannot tell
  // a truncated scrape from a complete one, so it wrote the fragment as the
  // bill's whole original_text, summarised it, and set summary_ok = TRUE --
  // after which lease_next_bill never re-queues that row. The missing half of
  // the bill was then gone for good, recorded only in a log line, while the app
  // presented the fragment to a survivor as the law.
  //
  // Returning null leaves the bill with no text. Be clear about that: the
  // LegiScan getBillText path is gated behind SYNC_USE_LEGISCAN, which defaults
  // to false and is off in production (docs/external-api-policy.md records why
  // it cannot simply be switched on), so in practice there is no fallback here.
  //
  // No text is still the better failure. `original_text IS NULL` sorts FIRST in
  // lease_next_bill's ORDER BY, so the bill stays at the head of the queue and
  // is visibly incomplete; a stored fragment sorts as done and is never seen
  // again. One is a bill waiting to be fixed, the other is a wrong answer
  // presented as the law.
  //
  // With the ceiling at 12 M against a largest-real-bill of 8.08 M this should
  // never fire. If it does, the page is pathological or California has outgrown
  // the ceiling, and both want a human rather than a silent fragment.
  if (available > LEGINFO_MAX_SLICE_CHARS) {
    console.warn(
      "Leginfo page exceeds the slice ceiling; refusing to store a partial bill",
      { available_chars: available, ceiling: LEGINFO_MAX_SLICE_CHARS },
    );
    return null;
  }

  const cleaned = stripHtmlToText(html.slice(start));
  return cleaned.length > 0 ? cleaned : null;
};

const scrapeLeginfoText = async (stateLink: string): Promise<string | null> => {
  try {
    const urlObj = new URL(stateLink);
    const billId = urlObj.searchParams.get("bill_id");
    if (!billId) return null;

    const leginfoUrl =
      `https://leginfo.legislature.ca.gov/faces/billTextClient.xhtml?bill_id=${billId}`;
    // Timed. This fetch had no abort at all, so a leginfo server that accepted
    // the connection and then stalled would hold the invocation until the
    // platform killed it -- taking the lease drain with it. It is also the one
    // request in the bill path that pulls megabytes, so it is the likeliest to
    // hang. AbortSignal.timeout covers the body read as well as the headers.
    const res = await fetch(leginfoUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(LEGINFO_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const html = await res.text();
    return extractLeginfoBillText(html);
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

type SummaryShortfall = {
  level: "simple" | "medium" | "complex";
  actual: number;
  required: number;
};

// Mirrors the validator exactly, in both respects that matter:
//
//  * it measures the post-toAscii string, which is what the validator judges;
//  * it skips any level whose existing stored summary is being kept, because
//    the validator only enforces a floor when the matching existing* is absent.
//    Without that skip the Spanish-backfill path (English already stored,
//    regenerating only because Spanish is missing) would re-ask over English
//    that englishFinal discards anyway -- paying for a second 12k-char
//    summarisation, and risking a non-ASCII retry failing a bill that was about
//    to succeed.
//
// Returns every shortfall, not just the first: naming one level meant a bill
// short on two got one fixed and still threw on the other, re-entering the same
// never-converging loop this exists to close.
const collectLengthShortfalls = (
  english: { simple: string; medium: string; complex: string } | undefined,
  keepExisting: { simple: boolean; medium: boolean; complex: boolean },
): SummaryShortfall[] => {
  if (!english) return [];
  const levels: Array<SummaryShortfall["level"]> = [
    "simple",
    "medium",
    "complex",
  ];
  const out: SummaryShortfall[] = [];
  for (const level of levels) {
    if (keepExisting[level]) continue;
    const value = english[level];
    // A missing or empty level counts as a shortfall of zero, not as "nothing
    // to report". Skipping it meant the worst possible response -- a level that
    // came back empty -- produced no shortfall, so no re-ask fired, and the
    // completeness check downstream threw "Incomplete English summaries
    // returned". Nothing about the next cron run would differ, so the bill
    // failed identically forever: the exact non-converging loop the re-ask
    // exists to close, entered through the one case that needs it most.
    const actual = value ? toAscii(value).length : 0;
    const required = MIN_SUMMARY_LENGTHS[level];
    if (actual < required) out.push({ level, actual, required });
  }
  return out;
};

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

// Bounds a bill's wall clock. Passed in per call, never held at module scope --
// see the note on the parameter below.
//
// Before this existed, nothing bounded a single bill. One withRetries round is
// 3 attempts x 45s plus 1s and 2s of backoff -- about 138s -- and a bill runs
// several of them (summariser, optionally a re-ask, then the embedding). No
// reserve inside a 150s ceiling can cover that, which meant LEASE_CUTOFF_MS
// bounded only when work *started*, never when it ended, and a run could sail
// past 150s and be killed with its lease drain unexecuted.
//
// Reserving more time per bill cannot fix that -- the worst case exceeds the
// entire budget -- so the work is bounded instead: no attempt begins unless it
// can finish before the deadline, and each attempt's abort is clamped to the
// time actually left.
const ATTEMPT_TIMEOUT_MS = 45_000;
// An attempt given less than this has no realistic chance against an API call,
// so it is not worth spending the remaining time to find that out.
const MIN_ATTEMPT_MS = 5_000;

// `deadlineAt` is a parameter rather than module state, and that is not a style
// preference. bulk-import-dataset fans out up to 10 concurrent sync
// invocations, and an edge isolate is reused across requests -- so a module-level
// deadline is shared mutable state between overlapping runs. The last one to
// start would overwrite it, granting an already-running invocation a later
// deadline than its own budget, which is precisely the overrun-and-be-killed
// path the deadline was added to close. Threading it through keeps each run's
// budget its own.
const withRetries = async <T>(
  fn: (attempt: number, signal: AbortSignal) => Promise<T>,
  attempts = 3,
  deadlineAt = Number.POSITIVE_INFINITY,
): Promise<T> => {
  let backoffMs = 1000;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const msLeft = deadlineAt - Date.now();
    if (msLeft < MIN_ATTEMPT_MS) {
      // Refuse rather than start work that cannot finish. Throwing here fails
      // this bill, which the caller handles: the lease is released in the
      // drain and the next run retries it. Starting the attempt anyway risks
      // the invocation being killed, which strands the lease for 900s and skips
      // the drain entirely -- strictly worse for the same bill.
      throw lastError ??
        new Error(
          `Run deadline reached before attempt ${attempt} (${msLeft}ms left)`,
        );
    }

    const controller = new AbortController();
    // Clamped to the run deadline, so a hung call cannot outlive the budget.
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(ATTEMPT_TIMEOUT_MS, msLeft),
    );
    try {
      return await fn(attempt, controller.signal);
    } catch (error) {
      lastError = error;
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
      // Do not sleep past the deadline either; the check at the top of the next
      // iteration would only wake up to refuse.
      await sleep(
        Math.max(0, Math.min(waitMs + jitter, deadlineAt - Date.now())),
      );
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
  // Appended verbatim to the user turn. Used to re-ask when a generation came
  // back under the length floors, so the model is told what it actually missed
  // instead of being handed the identical prompt again.
  reinforcement?: string,
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
          // The length floors are interpolated rather than described in prose
          // because the validator below rejects anything under them, and the
          // prompt never used to mention them at all. AB101 ("Budget Act of
          // 2025") failed on 2026-08-12 with "Medium summary below minimum
          // length (372)" against a 400 floor -- the model had no way to know
          // the target, and a bill that misses it re-queues and fails
          // identically forever. Deriving both from MIN_SUMMARY_LENGTHS keeps
          // the instruction and the check from drifting apart again.
          content:
            `Source text:\n---\n${text}\n---\nInstructions: English summaries must be ASCII only. Simple level ≈5th grade with ≥1 paragraph and at least ${
              summaryTarget(MIN_SUMMARY_LENGTHS.simple)
            } characters. Medium ≈10th grade with ≥2 paragraphs and at least ${
              summaryTarget(MIN_SUMMARY_LENGTHS.medium)
            } characters. Complex is an expert legal analysis of at least ${
              summaryTarget(MIN_SUMMARY_LENGTHS.complex)
            } characters. Prefer concrete specifics from the bill over generic description of what the law is. Treat the character counts as targets, not licence to invent: never state an effect, program or amount the source text does not support. A short bill should get a shorter, accurate summary rather than a padded or embellished one -- this app is read by survivors making decisions, and a fabricated legal effect is worse than a brief summary. Spanish should remain natural with diacritics.${
              reinforcement ? `\n${reinforcement}` : ""
            }`,
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

  // Oversized bills used to be head-truncated with slice(0, MAX). For a long
  // bill that hands the model nothing but the opening boilerplate, and the
  // resulting summaries say what a statute *is* rather than what this bill
  // *does*. It showed up most clearly on California's budget bills, which run
  // 1.2-1.6 MB -- so the model saw well under 1% of the document, all of it
  // preamble, and every Budget Act summary came out near-identical and
  // contentless ("a law that helps fund the state government for the year
  // 2025-26"), regardless of what the bill actually appropriated.
  //
  // Sample the head and the tail instead, within the same character budget:
  // the head keeps the title, findings and enacting clause that establish what
  // the bill is, and the tail carries the operative sections that a preamble
  // never reaches. Bills under the limit are untouched, so this only changes
  // inputs that were previously being silently gutted.
  const notice =
    "\n\n[...text elided for model input; the opening and closing sections of the bill are shown...]\n\n";
  const budget = MAX_MODEL_INPUT_CHARS - notice.length;
  const headChars = Math.floor(budget * 0.4);
  const tailChars = budget - headChars;
  return `${combined.slice(0, headChars)}${notice}${
    combined.slice(-tailChars)
  }`;
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
      getServiceKey(),
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
    // Declared here, not beside the loop, because processBill closes over it to
    // decide whether there is time left for a summariser re-ask.
    const runStartedAt = Date.now();
    // This run's own deadline. A local, passed explicitly to every withRetries
    // call, so concurrent invocations sharing an isolate cannot overwrite each
    // other's budget.
    const runDeadlineAt = runStartedAt + RUN_TIME_BUDGET_MS;
    const maxBillsToProcess = MAX_BILLS_PER_RUN;

    await logCronDebug(
      supabaseAdmin,
      `Starting run. owner=${owner} maxBillsToProcess=${maxBillsToProcess} legiscanDetailsEnabled=${legiscanDetailsEnabled}`,
    );

    const processedBills: number[] = [];
    const failures: Array<{ billId: number; reason: string }> = [];
    // Leases held past their bill's failure so the loop cannot re-lease the same
    // bill; drained after the loop. See the deferral note at the catch site.
    const failedLeases: number[] = [];
    // Every bill this run has leased. Guards against processing one twice; see
    // the check at the lease site.
    const attemptedIds = new Set<number>();

    // Release the deferred failed leases and forget them. Safe to call at any
    // point, including with nothing pending.
    //
    // Best-effort and never fatal: a release that itself fails leaves a lease to
    // expire on its 900s TTL, whereas throwing -- especially from the finally --
    // would replace the run's real error with this one.
    //
    // Issued together rather than in sequence, because the finally call runs
    // after LEASE_CUTOFF_MS with no time reserve of its own; one concurrent
    // batch keeps the window in which a kill could strand the rest to roughly a
    // single round trip.
    const drainFailedLeases = async () => {
      if (failedLeases.length === 0) return;
      const draining = failedLeases.splice(0, failedLeases.length);
      await Promise.allSettled(
        draining.map(async (failedId) => {
          try {
            const { error: releaseError } = await supabaseAdmin
              .rpc("release_bill_lease", {
                p_id: failedId,
                p_owner: owner,
                p_ok: false,
              });
            if (releaseError) {
              console.error("Failed to release lease", {
                bill_id: failedId,
                error: String(releaseError),
              });
            }
          } catch (releaseThrow) {
            console.error("Failed to release lease", {
              bill_id: failedId,
              error: errorToMessage(releaseThrow),
            });
          }
        }),
      );
    };
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

        const generateSummaries = (reinforcement?: string, attempts = 3) =>
          withRetries(
            (_, signal) =>
              callSummarizer(
                summarizerSource,
                openAiKey,
                signal,
                String(billData?.bill_id ?? billId ?? "unknown"),
                reinforcement,
              ),
            attempts,
            runDeadlineAt,
          );

        let summaries = await generateSummaries();

        // withRetries covers transport failures on the OpenAI call, not a
        // response that came back too short. Without this re-ask a single
        // sub-floor generation fails the bill outright, and because nothing
        // about the next run differs it fails identically every cron cycle --
        // burning a paid summarisation each time and never converging. AB101
        // was stuck exactly this way at 372 characters against a 400 floor.
        const keepExisting = {
          simple: Boolean(existingSimple),
          medium: Boolean(existingMedium),
          complex: Boolean(existingComplex),
        };
        // spanishFinal prefers existingSpanish* the same way englishFinal prefers
        // existing*, so the Spanish guards need the same exemption: a level we
        // are going to discard must not be able to fail the bill.
        const keepExistingSpanish = {
          simple: Boolean(existingSpanishSimple),
          medium: Boolean(existingSpanishMedium),
          complex: Boolean(existingSpanishComplex),
        };
        const shortfalls = collectLengthShortfalls(
          summaries.english,
          keepExisting,
        );

        // The re-ask gets ONE attempt, not withRetries' default three. That is
        // what makes SUMMARY_REASK_RESERVE_MS a truthful reserve: a full round
        // is 3 x 45s aborts plus 1s and 2s of backoff, about 138s, which no
        // reserve inside a 110s budget could honestly cover. Gating a 138s
        // worst case on a 45s reserve would let a bill 25s into the run start a
        // re-ask, time out three times, and get the invocation killed mid-bill
        // -- stranding the lease for its full 900s TTL, since release_bill_lease
        // only runs in the loop's catch. Capping the re-ask at one attempt makes
        // its worst case 45s, which the reserve does cover.
        //
        // Retries are the right call for the first generation, which the bill
        // cannot proceed without. They are the wrong call for a re-ask, which is
        // an optional quality improvement over a response we already hold.
        const msLeftForRetry = RUN_TIME_BUDGET_MS - (Date.now() - runStartedAt);
        const haveTimeToRetry = msLeftForRetry >= SUMMARY_REASK_RESERVE_MS;

        // A Spanish level that will not survive downstream is a re-ask trigger
        // too. The re-ask was driven by English shortfalls alone, so a response
        // with perfect English and a bad Spanish medium never got a second
        // attempt -- it went straight to a throw and failed the bill on every
        // run thereafter.
        //
        // The test is isValidSummary, deliberately the STRICTEST of the three
        // that Spanish faces later, not raw truthiness. Truthiness agrees with
        // none of them: " " is truthy but dies on the trim guard (throw, every
        // run, forever), and a 5-character level passes the trim guard but fails
        // isValidSummary inside spanishFinal, which silently stores the bill
        // with summary_ok = true and no Spanish translation -- never re-queued,
        // so a survivor reading in Spanish gets nothing and nothing notices.
        // Triggering on the strictest test means anything the re-ask can fix
        // gets the chance.
        const spanishLevelUsable = (level: "simple" | "medium" | "complex") =>
          keepExistingSpanish[level] ||
          isValidSummary(summaries.spanish?.[level]);

        const missingSpanish = (["simple", "medium", "complex"] as const)
          .filter((level) => !spanishLevelUsable(level));

        if (
          (shortfalls.length > 0 || missingSpanish.length > 0) &&
          haveTimeToRetry
        ) {
          console.warn(
            "- Summaries incomplete or under target; re-asking once",
            {
              bill_id: billData.bill_id,
              shortfalls,
              missing_spanish: missingSpanish,
            },
          );
          // Built from whichever problems actually occurred. Naming the English
          // shortfalls unconditionally produced "fell short on these levels: ."
          // when the only fault was a missing Spanish level, which tells the
          // model nothing about what to fix.
          const reinforcementParts: string[] = [];
          if (shortfalls.length > 0) {
            const detail = shortfalls
              .map((entry) =>
                // Quote the target, not entry.required. The base instruction asks
                // for summaryTarget() and the raw floor is the smaller, more
                // specific number -- naming it here invites the model to aim at
                // the floor and land just under it after toAscii, defeating the
                // margin.
                `${entry.level} was ${entry.actual} characters, short of the ${
                  summaryTarget(entry.required)
                } it needs`
              )
              .join("; ");
            reinforcementParts.push(
              `A previous attempt fell short on these English levels: ${detail}. ` +
                `Expand each of those levels using additional concrete detail ` +
                `drawn from the bill text -- specific programs, amounts, ` +
                `sections or effects. Do not pad with generalities, and do not ` +
                `invent effects the text does not support: if the bill is ` +
                `genuinely short, describe what it does in more depth rather ` +
                `than adding claims.`,
            );
          }
          if (missingSpanish.length > 0) {
            reinforcementParts.push(
              `A previous attempt returned no Spanish text for: ` +
                `${missingSpanish.join(", ")}. Every Spanish level must be ` +
                `present and must be a faithful translation of the ` +
                `corresponding English level.`,
            );
          }
          // Caught, not propagated. `summaries` already holds a response that
          // the two-tier floor check below will happily store -- 372 characters
          // against a 400 target is short of ideal but far above the hard floor.
          // Letting the re-ask's failure escape would throw that away and fail
          // the bill on the strength of an optional improvement, which is the
          // never-converging loop this whole re-ask exists to close, entered
          // from the other side.
          let retried: Awaited<ReturnType<typeof generateSummaries>> | null =
            null;
          try {
            retried = await generateSummaries(reinforcementParts.join(" "), 1);
          } catch (error) {
            console.warn(
              "- Summary re-ask failed; keeping the first response",
              {
                bill_id: billData.bill_id,
                bill_number: billData.bill_number,
                error: errorToMessage(error),
              },
            );
          }

          // Adopt the retry when it is BETTER, not only when it is perfect.
          //
          // Requiring the retry to clear every target looked safe and was not:
          // if the first response had an empty level and the retry filled it but
          // landed slightly under target, the retry was thrown away, the broken
          // first response was kept, and the completeness check below threw --
          // identically on every future run, since nothing about the next
          // attempt differs. Demanding perfection from the fallback is how you
          // end up keeping the worse of two answers.
          //
          // `storable` is the dominant term because it is exactly what the
          // validators below enforce: all six levels present, and every level we
          // will actually use at or above the hard floor. A response that is
          // storable always beats one that is not, whatever their lengths. Only
          // between two equally storable responses does the aggregate shortfall
          // decide, which preserves the property that motivated the strict check
          // -- a retry that improves one level by less than it regresses another
          // is not an improvement and is not taken.
          const summaryDeficit = (candidate: typeof summaries): number => {
            // A candidate with no english object at all scores WORST, not best.
            // collectLengthShortfalls returns [] for a falsy english -- correct
            // for its own purpose, actively wrong as a score, because "no
            // shortfalls" then reads as a perfect zero. In the tiebreak where
            // neither candidate is storable that let an empty retry beat a first
            // response holding usable English. Only the strict json_schema
            // prevents this in practice, and a scoring function should not
            // depend on a guarantee made somewhere else.
            if (!candidate.english) return Number.POSITIVE_INFINITY;
            return collectLengthShortfalls(candidate.english, keepExisting)
              .reduce(
                (total, entry) => total + (entry.required - entry.actual),
                0,
              );
          };

          // Scoped to the levels this response will actually contribute, for
          // the same reason the guards below are: a level backed by an existing
          // summary is discarded whatever comes back, so it must not veto an
          // otherwise good retry. Checking all six unconditionally meant a retry
          // that repaired the level we needed was thrown away because an unused
          // one came back empty -- keeping the broken first response, which then
          // threw, every run, forever.
          const isStorable = (candidate: typeof summaries | null): boolean => {
            if (!candidate?.english || !candidate?.spanish) return false;
            const { english, spanish } = candidate;
            return (["simple", "medium", "complex"] as const).every((level) => {
              // Length AND the placeholder/error tests. isStorable claims to
              // mean "will not throw below", and englishFinal is checked with
              // isValidSummary further down -- so judging only on length let a
              // retry containing "placeholder" or an "Error: " prefix count as
              // storable, win the deficit tiebreak, replace a clean first
              // response, and then throw. A predicate that names itself after a
              // downstream rule has to apply all of that rule.
              const englishOk = keepExisting[level] ||
                (Boolean(english[level]) &&
                  toAscii(english[level]).length >= SUMMARY_HARD_FLOOR_CHARS &&
                  !invalidSummaryPrefix.test(english[level].trim()) &&
                  !invalidSummaryPlaceholder.test(english[level].trim()) &&
                  !invalidSummaryFailedMarker.test(english[level].trim()));
              // isValidSummary, because that is what spanishFinal uses to decide
              // whether a bill_translations row is written at all. Spanish no
              // longer throws, so "storable" cannot mean "will not throw" for
              // it; the thing worth preferring is a response whose Spanish will
              // actually be stored. Judging it by isUsableSpanishSummary let a
              // retry whose Spanish was "N/A" count as storable, win the deficit
              // tiebreak, replace a first response with three valid Spanish
              // levels, and lose the translation row entirely.
              const spanishOk = keepExistingSpanish[level] ||
                isValidSummary(spanish[level]);
              return englishOk && spanishOk;
            });
          };

          if (retried) {
            const firstStorable = isStorable(summaries);
            const retryStorable = isStorable(retried);
            // Storability decides when the two differ on it; deficit decides
            // when they agree -- INCLUDING when both are unstorable. Requiring
            // retryStorable outright discarded the re-ask whenever the retry
            // fell short, even though the first response was equally doomed and
            // about to throw: the better of two failing answers was thrown away
            // for not being perfect, and the bill failed the same way on every
            // subsequent run. When neither can be stored, taking the one that is
            // closer costs nothing and can only help.
            const better = (retryStorable && !firstStorable) ||
              (retryStorable === firstStorable &&
                summaryDeficit(retried) < summaryDeficit(summaries));

            if (better) {
              summaries = retried;
            } else {
              // Only when a retry actually came back. A thrown re-ask has
              // already been logged by the catch above; warning again here would
              // report the same event twice under two different causes.
              console.warn(
                "- Re-ask did not improve on the first response; keeping it",
                {
                  bill_id: billData.bill_id,
                  first_storable: firstStorable,
                  retry_storable: retryStorable,
                },
              );
            }
          }
        } else if (shortfalls.length > 0 || missingSpanish.length > 0) {
          // missingSpanish is in this condition too. It was omitted, so a run
          // whose only defect was an unusable Spanish level and which had no
          // time to re-ask logged nothing at all -- the one case that most needs
          // a trace, because Spanish problems are otherwise invisible.
          console.warn(
            "- Summaries incomplete or under target but no run time left to re-ask",
            {
              bill_id: billData.bill_id,
              shortfalls,
              missing_spanish: missingSpanish,
              ms_left: msLeftForRetry,
            },
          );
        }

        const englishSummaries = summaries.english;
        const spanishSummaries = summaries.spanish;

        // Every English guard below is scoped to the levels this response will
        // actually contribute. englishFinal prefers `existing*` over anything
        // generated here, so a level backed by an existing summary is discarded
        // regardless of what came back -- and letting it throw meant a Spanish-
        // only backfill could fail permanently because the English complex it
        // was never going to use came back empty. collectLengthShortfalls
        // already skips those levels; these guards now agree with it.
        const generatedLevels = (["simple", "medium", "complex"] as const)
          .filter((level) => !keepExisting[level]);

        const generatedSpanishLevels =
          (["simple", "medium", "complex"] as const)
            .filter((level) => !keepExistingSpanish[level]);

        // The payload objects are asserted before the per-level loops. Scoping
        // those loops to the generated levels removed the only check that these
        // exist at all: a response missing `english` outright would raise a bare
        // TypeError on the first property access below instead of the domain
        // error, and when every level is kept the loops are empty, so nothing
        // would have looked at the payload before it was dereferenced.
        if (!englishSummaries) {
          throw new Error("Incomplete English summaries returned");
        }

        if (generatedLevels.some((level) => !englishSummaries[level])) {
          throw new Error("Incomplete English summaries returned");
        }
        // No matching throw for Spanish. An absent Spanish level arrives below
        // as "" after the ?? "" trim, is reported by the weakSpanish warning,
        // and skips the translation row -- the same path as any other
        // sub-standard Spanish. Throwing here would have been the one remaining
        // way for a Spanish problem to destroy three good English summaries.

        asciiEnglish = {
          simple: toAscii(englishSummaries.simple ?? ""),
          medium: toAscii(englishSummaries.medium ?? ""),
          complex: toAscii(englishSummaries.complex ?? ""),
        };

        if (generatedLevels.some((level) => !asciiEnglish![level])) {
          throw new Error("Empty English summaries after ASCII normalization");
        }

        if (
          generatedLevels.some((level) => asciiGuard.test(asciiEnglish![level]))
        ) {
          throw new Error("English summaries contain non-ASCII characters");
        }

        // Two-tier length check. Below SUMMARY_HARD_FLOOR_CHARS the generation
        // is broken and we throw so the bill retries. Between that and the
        // MIN_SUMMARY_LENGTHS target we accept with a warning: a re-ask has
        // already been spent (or declined for time), the prompt itself tells the
        // model that a genuinely short bill deserves a short summary, and
        // throwing here would fail the same bill identically on every future
        // run. See SUMMARY_HARD_FLOOR_CHARS for the full reasoning.
        const shortAfterReask: string[] = [];
        for (const level of generatedLevels) {
          const text = asciiEnglish[level];
          if (text.length < SUMMARY_HARD_FLOOR_CHARS) {
            throw new Error(
              `${level} summary below hard floor (${text.length} < ${SUMMARY_HARD_FLOOR_CHARS})`,
            );
          }
          if (text.length < MIN_SUMMARY_LENGTHS[level]) {
            shortAfterReask.push(
              `${level} ${text.length}/${MIN_SUMMARY_LENGTHS[level]}`,
            );
          }
        }

        if (shortAfterReask.length > 0) {
          // Warned rather than silently accepted: a run of these means the
          // targets no longer match what the source bills can support, which is
          // a prompt/threshold question for a human, not something to retry into
          // forever.
          console.warn(
            "- Accepting summaries under target length after re-ask",
            {
              bill_id: billData.bill_id,
              bill_number: billData.bill_number,
              levels: shortAfterReask,
            },
          );
        }

        spanishTrimmed = {
          // Optional access: a wholly absent `spanish` object is no longer a
          // throw, so it has to degrade to empty strings here and flow through
          // the weakSpanish warning like any other missing level.
          simple: (spanishSummaries?.simple ?? "").trim(),
          medium: (spanishSummaries?.medium ?? "").trim(),
          complex: (spanishSummaries?.complex ?? "").trim(),
        };

        // Spanish never throws. It warns, and spanishFinal below turns a
        // sub-standard level into a SKIPPED bill_translations row, which
        // translation.ts refills on demand.
        //
        // Throwing here was tried and was wrong in both directions. Using
        // isValidSummary meant a 32-character Spanish complex discarded three
        // good English summaries, left the bill with nothing in any language,
        // and burned two OpenAI calls every run forever. Loosening the test to
        // stop that then allowed "N/A" to be written as a real translation,
        // which permanently suppresses the on-demand fallback. Neither is a
        // threshold problem -- the mistake was tying the fate of the English to
        // the quality of the Spanish at all.
        //
        // The English has already passed its own two-tier check by this point.
        // A Spanish problem now costs one skipped row, recoverable the next
        // time anyone opens the bill in Spanish.
        const weakSpanish = generatedSpanishLevels.filter((level) =>
          !isValidSummary(spanishTrimmed![level])
        );
        if (weakSpanish.length > 0) {
          console.warn(
            "- Spanish below standard; skipping the translation row",
            {
              bill_id: billData.bill_id,
              bill_number: billData.bill_number,
              levels: weakSpanish.map((level) => {
                const value = spanishTrimmed![level];
                return isUsableSpanishSummary(value)
                  ? `${level} short (${value.length}/${MIN_SPANISH_SUMMARY_CHARS})`
                  : `${level} unusable`;
              }),
            },
          );
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

        const embedding = await withRetries(
          (_, signal) => callEmbedding(textForEmbedding, openAiKey, signal),
          3,
          runDeadlineAt,
        );

        embeddingPayload = `[${embedding.join(",")}]`;
      }

      // Back to the strict isValidSummary, and this is the load-bearing half of
      // the Spanish design -- see the guard above for the other half.
      //
      // Nulling a sub-standard level here does NOT lose it silently. It makes
      // spanishComplete false, which skips the bill_translations write
      // entirely, and translation.ts treats a bill with NO row as missing and
      // fills it through the translate-bill edge function the first time
      // someone reads that bill in Spanish. Writing a weak row instead is what
      // would be permanent: fetchTranslationsForBills computes `missing` as
      // "no row for this bill", so any row at all -- "N/A", or one with null
      // columns, which upsert_bill_and_translation happily inserts -- marks the
      // bill as cached and suppresses that fallback forever, while
      // lease_next_bill never looks at bill_translations to re-queue it.
      //
      // So the three outcomes are: broken Spanish warns and skips the row;
      // short-but-real Spanish warns and skips the row; good Spanish is
      // written. In none of them is the English discarded, and in none of them
      // is a bad translation cached over a recoverable gap.
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

    let stoppedForTimeBudget = false;
    // Separate from stoppedForTimeBudget so the response can distinguish "ran
    // out of clock" from "the queue handed the same bill back". Both mean work
    // remains; only one is normal.
    let stoppedForRepeatLease = false;
    // try/finally, because the drain below is not optional. leaseNextBillId()
    // sits outside the per-bill try/catch and rethrows RPC errors -- and a
    // lease_next_bill statement timeout is not hypothetical, it is what
    // 20260812120000 was written to fix and what production hit daily. Without
    // finally, that throw at iteration N skips the drain entirely and leaves
    // every already-failed bill leased for its full 900s TTL. Those bills sort
    // FIRST in lease_next_bill's ORDER BY, so the head of the queue would be
    // invisible to every run for fifteen minutes -- strictly worse than the
    // immediate release this deferral replaced.
    try {
      for (let i = 0; i < maxBillsToProcess; i++) {
        const elapsedMs = Date.now() - runStartedAt;
        // The budget gates whether to *start* another bill, so a bill leased just
        // under the line still runs to completion and the invocation can overrun.
        // Reserve headroom for one worst-case bill rather than checking against
        // the raw budget, so the guard bounds the whole run and not just the
        // moment work is handed out.
        if (elapsedMs >= LEASE_CUTOFF_MS) {
          stoppedForTimeBudget = true;
          const message =
            `Stopping before iteration ${i}: run time budget reached (${elapsedMs}ms of ${RUN_TIME_BUDGET_MS}ms, cutoff ${LEASE_CUTOFF_MS}ms after reserving ${PER_BILL_HEADROOM_MS}ms for an in-flight bill). Remaining bills roll over to the next run.`;
          // Surfaced through console + the response body, not only logCronDebug:
          // that helper is a no-op unless SYNC_DEBUG_LOGS=true, which made a
          // truncated run indistinguishable from a drained queue.
          console.warn(message);
          await logCronDebug(supabaseAdmin, message);
          break;
        }

        const nextId = await leaseNextBillId();

        // Safety net, and it should never fire: a failed bill's lease is held
        // until the finally, so lease_next_bill's own predicate excludes it for
        // the rest of the run. If one is handed back anyway -- a release RPC
        // that partially succeeded, a clock skew, a second worker -- reprocessing
        // it would repeat the same failure, double-count it in `failures`, and
        // spend an iteration to learn nothing. The ordering is deterministic, so
        // a repeat means every further lease returns the same row: stop rather
        // than spin.
        if (nextId && attemptedIds.has(nextId)) {
          stoppedForRepeatLease = true;
          // lease_next_bill has ALREADY taken the lease by the time we see the
          // id, so bailing out without recording it leaked that lease: the
          // finally drain would not know about it and the bill would sit leased
          // for its full 900s TTL at the head of the queue -- the very stranding
          // this guard exists to avoid. Hand it to the drain like any other
          // unfinished bill.
          failedLeases.push(nextId);
          const message =
            `lease_next_bill returned already-attempted bill ${nextId} at iteration ${i}; stopping to avoid a loop`;
          console.warn(message);
          await logCronDebug(supabaseAdmin, message);
          break;
        }

        if (!nextId) {
          await logCronDebug(
            supabaseAdmin,
            `lease_next_bill returned null at iteration ${i}`,
          );
          break;
        }

        attemptedIds.add(nextId);

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

          // Deferred, NOT released here. release_bill_lease sets
          // summary_lease_until = NULL, and lease_next_bill's candidate predicate
          // admits any row whose lease is null or expired, ordered deterministically
          // (original_text IS NULL first, then summary_ok, then id). Releasing a
          // failed bill immediately therefore hands the very same bill back on the
          // next iteration, and it fails the same way -- so a run with
          // MAX_BILLS_PER_RUN=8 spent all eight iterations on one stuck bill and
          // drained nothing. Raising 3 -> 8 bought no throughput at all while the
          // head of the queue was failing, which is exactly the state production
          // has been in.
          //
          // Held until the finally -- ALL of them, for the whole run.
          //
          // An intermediate version released the previous failure as soon as a
          // replacement had been leased, to bound how many leases a kill could
          // strand. That does not work: releasing A after leasing B makes A
          // eligible again, and since A sorts first the next lease returns A,
          // then B, then A. The run alternates between two failing bills, burns
          // all 8 iterations on them, never reaches the backlog, and
          // double-counts both in `failures`. It is the same defect as
          // releasing immediately, with a period of two instead of one.
          //
          // Holding every failed lease for the run is the only arrangement in
          // which lease_next_bill actually advances, because its predicate
          // excludes a leased row and its ordering is deterministic. The cost
          // is real and worth stating: an invocation killed at the 150s limit
          // strands all of this run's failed leases for their 900s TTL, at the
          // head of the queue. That is fifteen minutes of delay on bills that
          // are already failing, against a loop that otherwise drains nothing
          // at all -- and the next run picks them up regardless.
          failedLeases.push(nextId);
          failures.push({ billId: nextId, reason: failureReason });
        }
      }
    } finally {
      // The only release point. In a finally because leaseNextBillId() sits
      // outside the per-bill try/catch and rethrows RPC errors -- a
      // lease_next_bill statement timeout is what 20260812120000 exists to fix
      // and what production hit daily -- and skipping the drain on that path
      // would leave every failure leased for its full TTL.
      await drainFailedLeases();
    }

    if (processedBills.length === 0 && failures.length > 0) {
      return toJson({
        error:
          "All leased bills failed during text import or summary generation.",
        stoppedForTimeBudget,
        stoppedForRepeatLease,
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
        // Do not claim a drained queue if the loop stopped early for ANY
        // reason. The repeat-lease bail-out used to fall through to "All bills
        // are up-to-date" with the backlog untouched -- the same misreporting
        // stoppedForTimeBudget was added to eliminate, through a second exit.
        message: stoppedForTimeBudget
          ? "Sync stopped on the run time budget before processing any bills. Work remains queued."
          : stoppedForRepeatLease
          ? "Sync stopped after lease_next_bill returned an already-attempted bill, before processing any bills. Work remains queued."
          : "Sync complete. All bills are up-to-date.",
        stoppedForTimeBudget,
        stoppedForRepeatLease,
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
      message: stoppedForTimeBudget
        ? `Processed ${processedBills.length} bill(s), then stopped on the run time budget. Work remains queued.`
        : stoppedForRepeatLease
        ? `Processed ${processedBills.length} bill(s), then stopped after lease_next_bill returned an already-attempted bill. Work remains queued.`
        : `Processed ${processedBills.length} bill(s).`,
      stoppedForTimeBudget,
      stoppedForRepeatLease,
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
