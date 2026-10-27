// supabase/functions/bulk-import-dataset/discovery.ts
//
// Pure helpers for the full-text discovery sweep in index.ts. Kept separate so
// they can be unit-tested without importing index.ts, which starts a server.

// The LegiScan dataset only carries bill metadata (title + the "An act to
// amend …" description), so a title/description keyword match cannot see terms
// that appear in the operative bill text. CA AB2691 ("Elections: elective
// office: felony conviction.") is the canonical example: the disqualifying
// crimes "sexual assault" and "human trafficking" only appear in Section 1.
// These phrases are therefore run through LegiScan's full-text search engine,
// which indexes the bill text itself.
//
// The last five widen scope beyond trafficking/victimization to adjacent
// sex-industry and sex-offense policy. Each was added for a bill the sweep
// could not reach with the earlier list:
//   "commercial sex"   - AB2749 (2026), "Crimes: loitering." (PC 653.25 buyers)
//   "sex offender"     - AB1568 (2026), "Sex offenses: registration."
//   "pornographic", "sexually explicit", "child sexual abuse material"
//                      - AB1705 (2026), "Pornographic internet websites."
// They also widen the leginfo verification gate, which is built from this
// same list: any bill whose text mentions one of them is admitted.
export const RELEVANT_SEARCH_PHRASES = [
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
  "commercial sex",
  "sex offender",
  "child sexual abuse material",
  "sexually explicit",
  "pornographic",
];

export const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const buildVerifyRegex = (phrases: string[]): RegExp =>
  new RegExp(`(${phrases.map(escapeRegExp).join("|")})`, "i");

/**
 * Order-insensitive identity of a phrase list, persisted next to the rejected
 * cache. A bill is rejected because its text matched none of the phrases *at
 * the time*; once the list changes that verdict is stale, so a mismatch here
 * discards the cache and lets previously rejected bills be re-verified.
 */
export const phraseSetKey = (phrases: string[]): string =>
  Array.from(new Set(phrases.map((phrase) => phrase.trim().toLowerCase())))
    .filter((phrase) => phrase.length > 0)
    .sort()
    .join("|");

/**
 * Reservation key for one getSearch page. index.ts reserves with this key and
 * reads the call log back by it, so both must come from the same function.
 */
export const searchResourceKey = (
  state: string,
  sessionId: number,
  phrase: string,
  page: number,
): string => `${state}:${sessionId}:${phrase}:p${page}`;

/**
 * Least-recently-searched phrases first; never-searched phrases lead, in list
 * order.
 *
 * The sweep stops after LEGISCAN_SEARCH_MAX_CALLS_PER_RUN pages. Walking the
 * list in fixed order meant the same leading phrases took that budget every
 * run: with a daily cron and a 20-hour cooldown each one is eligible again by
 * the next run, so phrases further down (e.g. "prostitution") were starved
 * indefinitely. Ordering by last search rotates the budget across the list.
 */
export const orderPhrasesByLastSearched = (
  phrases: string[],
  lastSearchedMs: Map<string, number>,
): string[] =>
  phrases
    .map((phrase, index) => ({
      phrase,
      index,
      last: lastSearchedMs.get(phrase) ?? Number.NEGATIVE_INFINITY,
    }))
    .sort((a, b) => (a.last === b.last ? a.index - b.index : a.last - b.last))
    .map((entry) => entry.phrase);

/**
 * True when leginfo answered with a Cloudflare bot challenge instead of the
 * page. Distinct from a transient failure: retrying from the same egress keeps
 * hitting the challenge, so the caller stops fetching for the rest of the run
 * and reports it rather than burning the verification budget.
 */
export const isBotChallenge = (
  status: number,
  cfMitigated: string | null,
  body: string,
): boolean => {
  if (cfMitigated?.toLowerCase() === "challenge") return true;
  if (status !== 403 && status !== 429 && status !== 503 && status !== 200) {
    return false;
  }
  // Markers of the interstitial itself, as served by leginfo on 2026-10-27.
  // A hostname substring would be weaker: ordinary pages can load scripts from
  // Cloudflare's challenge host.
  return /<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(body) ||
    /\/cdn-cgi\/challenge-platform\/|\b_cf_chl_opt\b/.test(body);
};

/**
 * Per-invocation LegiScan budget shared by every call site in the function
 * (getDatasetList, getMasterList, getSearch, getDataset), so the policy floors
 * in docs/external-api-policy.md §3 hold for the invocation as a whole rather
 * than per call site. Callers check pacerCanCall() before reserving, wait
 * pacerWaitMs() before fetching, and pacerRecordCall() once the request
 * returns.
 */
export type CallPacer = {
  maxCalls: number;
  minGapMs: number;
  calls: number;
  lastCallAt: number | null;
};

export const createCallPacer = (
  maxCalls: number,
  minGapMs: number,
): CallPacer => ({ maxCalls, minGapMs, calls: 0, lastCallAt: null });

export const pacerCanCall = (pacer: CallPacer): boolean =>
  pacer.calls < pacer.maxCalls;

export const pacerWaitMs = (pacer: CallPacer, now: number): number =>
  pacer.lastCallAt === null
    ? 0
    : Math.max(0, pacer.lastCallAt + pacer.minGapMs - now);

export const pacerRecordCall = (pacer: CallPacer, now: number): void => {
  pacer.calls += 1;
  pacer.lastCallAt = now;
};

const BILL_NUMBER_RE = /^[A-Z]{1,4}\d{1,5}$/;
export const MAX_PINNED_BILLS = 25;

/**
 * Parses BULK_IMPORT_PINNED_BILLS ("AB1705|AB 1568, ab2749"). Entries are
 * separated by "|" or ","; internal whitespace is dropped and case folded so
 * "AB 1705" matches LegiScan's "AB1705".
 */
export const parsePinnedBillNumbers = (
  raw: string | null | undefined,
): { valid: string[]; invalid: string[] } => {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const entry of (raw ?? "").split(/[|,]/)) {
    const number = entry.replace(/\s+/g, "").toUpperCase();
    if (!number) continue;
    if (!BILL_NUMBER_RE.test(number)) {
      invalid.push(entry.trim());
    } else if (!valid.includes(number)) {
      valid.push(number);
    }
  }
  return {
    valid: valid.slice(0, MAX_PINNED_BILLS),
    invalid: [...invalid, ...valid.slice(MAX_PINNED_BILLS)],
  };
};

export type MasterListMatch = {
  bill_id: number;
  number: string;
  title: string | null;
  description: string | null;
  change_hash: string | null;
};

const textOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

/**
 * Picks the wanted bills out of a getMasterList `masterlist` object, whose
 * entries are keyed "0".."N" next to a non-bill "session" entry.
 */
export const matchPinnedFromMasterList = (
  masterlist: unknown,
  wanted: string[],
): MasterListMatch[] => {
  if (!masterlist || typeof masterlist !== "object") return [];
  const wantedSet = new Set(wanted);
  const matches = new Map<string, MasterListMatch>();

  for (const value of Object.values(masterlist as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;
    const number = typeof entry.number === "string"
      ? entry.number.replace(/\s+/g, "").toUpperCase()
      : "";
    if (!wantedSet.has(number) || matches.has(number)) continue;

    const billId = Number(entry.bill_id);
    if (!Number.isSafeInteger(billId) || billId <= 0) continue;

    matches.set(number, {
      bill_id: billId,
      number,
      title: textOrNull(entry.title),
      description: textOrNull(entry.description),
      change_hash: textOrNull(entry.change_hash),
    });
  }

  return wanted.flatMap((number) => {
    const match = matches.get(number);
    return match ? [match] : [];
  });
};
