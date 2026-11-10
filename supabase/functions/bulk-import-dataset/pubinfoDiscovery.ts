// Discovery of relevant bills from the Legislature's pubinfo archive.
//
// LegiScan getSearch was the only way a bill was found. This reads the same
// free archive the text and status come from: every bill version published
// since the last run is scored with the topic phrases, and a bill that passes
// the same mention threshold as search verification is admitted. LegiScan is
// needed for one thing only: bills.id is LegiScan's bill_id, so admitted bills
// wait in `awaiting` until a single getMasterList call resolves their ids
// (docs/plans/2026-11-10-pubinfo-primary-plan.md, decision A).
//
// The run is a background task with injected dependencies so it can be tested
// without the archive, the database or LegiScan.

import type { MasterListMatch } from "./discovery.ts";

export type PendingCandidate = { bill: string; date: string };
export type AwaitingBill = {
  bill: string;
  number: string;
  mentions: number;
  since: string;
};

export type PubinfoDiscoveryStats = {
  started_at: string;
  finished_at: string | null;
  archive: string | null;
  new_candidates: number;
  pending_before: number;
  pending_after: number;
  scored: number;
  admitted: number;
  rejected: number;
  unavailable: number;
  blocked: boolean;
  stopped_for_deadline: boolean;
  awaiting: number;
  lookup: "not_needed" | "called" | "skipped";
  lookup_skipped_reason: string | null;
  inserted: number;
  not_found: number;
  excluded: number;
  expired: number;
  errors: string[];
};

export type PubinfoDiscoveryState = {
  // Latest version date already considered. Versions are re-examined for
  // OVERLAP_DAYS before it, because a version can reach the archive a few
  // days after its action date.
  scanned_through: string | null;
  pending: PendingCandidate[];
  awaiting: AwaitingBill[];
  // bill -> version date last scored, for the overlap window only.
  scored: Record<string, string>;
  last_run: PubinfoDiscoveryStats | null;
};

export const emptyDiscoveryState = (): PubinfoDiscoveryState => ({
  scanned_through: null,
  pending: [],
  awaiting: [],
  scored: {},
  last_run: null,
});

const DAY_MS = 24 * 60 * 60 * 1000;
export const OVERLAP_DAYS = 5;
export const MAX_PENDING = 2_000;
// A bill LegiScan never lists (or a pending read that never succeeds) is
// dropped after this long and reported, rather than retried forever.
export const AWAITING_MAX_AGE_DAYS = 21;
export const PENDING_MAX_AGE_DAYS = 30;
const MAX_ERRORS = 10;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (day: string, days: number) =>
  isoDay(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS);

/** "202520260AB1568" -> "AB1568" for the regular session; else null. */
export const billNumberFromPubinfoId = (
  pubinfoId: string,
  yearStart: number,
  yearEnd: number,
): string | null => {
  const prefix = `${yearStart}${yearEnd}0`;
  if (!pubinfoId.startsWith(prefix)) return null;
  const number = pubinfoId.slice(prefix.length);
  return /^[A-Z]+\d+$/.test(number) ? number : null;
};

/**
 * Adds bill versions newer than the state has considered to `pending`.
 * Skips tracked bills, bills already awaiting an id, special-session bills
 * and versions already scored. Returns how many candidates are new.
 */
export const planCandidates = (
  state: PubinfoDiscoveryState,
  latestDateByBill: ReadonlyMap<string, string>,
  tracked: ReadonlySet<string>,
  session: { yearStart: number; yearEnd: number },
  options: { today: string; lookbackDays: number },
): number => {
  const floor = state.scanned_through
    ? addDays(state.scanned_through, -OVERLAP_DAYS)
    : addDays(options.today, -options.lookbackDays);
  const awaiting = new Set(state.awaiting.map((a) => a.bill));
  const pendingByBill = new Map(state.pending.map((p) => [p.bill, p]));

  let added = 0;
  let maxDate = state.scanned_through ?? floor;
  for (const [bill, date] of latestDateByBill) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    // A date in the future is a data error; do not let it move the cursor.
    if (date > options.today) continue;
    if (date > maxDate) maxDate = date;
    if (date <= floor) continue;
    if (
      billNumberFromPubinfoId(bill, session.yearStart, session.yearEnd) === null
    ) {
      continue;
    }
    if (tracked.has(bill) || awaiting.has(bill)) continue;
    if (state.scored[bill] === date) continue;
    const queued = pendingByBill.get(bill);
    if (queued) {
      // Amended again while queued: score the newer version.
      if (queued.date !== date) queued.date = date;
      continue;
    }
    const candidate = { bill, date };
    state.pending.push(candidate);
    pendingByBill.set(bill, candidate);
    added += 1;
  }

  state.scanned_through = maxDate;
  // Oldest first, bounded.
  state.pending.sort((a, b) =>
    a.date.localeCompare(b.date) || a.bill.localeCompare(b.bill)
  );
  if (state.pending.length > MAX_PENDING) {
    state.pending = state.pending.slice(-MAX_PENDING);
  }
  // Keep the scored memory to the window it is needed for.
  const keepFrom = addDays(maxDate, -OVERLAP_DAYS);
  for (const [bill, date] of Object.entries(state.scored)) {
    if (date < keepFrom) delete state.scored[bill];
  }
  return added;
};

export type ResolveResult =
  | { status: "ok"; matches: MasterListMatch[] }
  | { status: "skipped"; reason: string }
  | { status: "aborted"; reason: string };

export type DiscoveredRow = {
  bill: string;
  match: MasterListMatch;
};

export type PubinfoDiscoveryDeps = {
  loadState: () => Promise<PubinfoDiscoveryState>;
  saveState: (state: PubinfoDiscoveryState) => Promise<void>;
  /** pubinfo ids of every bill already in public.bills. */
  trackedPubinfoIds: () => Promise<Set<string>>;
  /** Latest version date per bill, plus a label for the archive read. */
  loadVersionDates: () => Promise<
    { dates: ReadonlyMap<string, string>; archive: string }
  >;
  /**
   * Topic mentions in the bill's latest text; null when the archive has no
   * text for it yet. Throws ChallengedError on a Cloudflare challenge.
   */
  countMentions: (bill: string) => Promise<number | null>;
  /** One LegiScan getMasterList lookup for these bill numbers. */
  resolveIds: (numbers: string[]) => Promise<ResolveResult>;
  isExcluded: (title: string | null) => boolean;
  /** Insert-only; returns the pubinfo ids actually inserted. */
  insertBills: (rows: DiscoveredRow[]) => Promise<string[]>;
  onInserted: (count: number) => Promise<void>;
  now: () => number;
};

export class ChallengedError extends Error {}

export type PubinfoDiscoveryOptions = {
  yearStart: number;
  yearEnd: number;
  minMentions: number;
  perRun: number;
  lookbackDays: number;
  deadlineAt: number;
  // False when LegiScan already failed in this invocation: scoring still
  // runs, the id lookup waits for a later run.
  legiscanAllowed: boolean;
};

const DEADLINE_GUARD_MS = 5_000;

export const runPubinfoDiscovery = async (
  deps: PubinfoDiscoveryDeps,
  options: PubinfoDiscoveryOptions,
): Promise<PubinfoDiscoveryStats> => {
  const startedAt = deps.now();
  const today = isoDay(startedAt);
  const stats: PubinfoDiscoveryStats = {
    started_at: new Date(startedAt).toISOString(),
    finished_at: null,
    archive: null,
    new_candidates: 0,
    pending_before: 0,
    pending_after: 0,
    scored: 0,
    admitted: 0,
    rejected: 0,
    unavailable: 0,
    blocked: false,
    stopped_for_deadline: false,
    awaiting: 0,
    lookup: "not_needed",
    lookup_skipped_reason: null,
    inserted: 0,
    not_found: 0,
    excluded: 0,
    expired: 0,
    errors: [],
  };
  const pushError = (message: string) => {
    if (stats.errors.length < MAX_ERRORS) stats.errors.push(message);
  };
  const message = (error: unknown) =>
    error instanceof Error ? error.message : String(error);

  const state = await deps.loadState();
  stats.pending_before = state.pending.length;

  try {
    let tracked = await deps.trackedPubinfoIds();

    // 1. New versions since the last run.
    try {
      const { dates, archive } = await deps.loadVersionDates();
      stats.archive = archive;
      stats.new_candidates = planCandidates(state, dates, tracked, options, {
        today,
        lookbackDays: options.lookbackDays,
      });
    } catch (error) {
      if (error instanceof ChallengedError) throw error;
      pushError(`pubinfo index unavailable: ${message(error)}`);
    }

    // 2. Score queued candidates, oldest first.
    const still: PendingCandidate[] = [];
    let index = 0;
    for (; index < state.pending.length; index += 1) {
      if (stats.scored + stats.unavailable >= options.perRun) break;
      if (deps.now() >= options.deadlineAt - DEADLINE_GUARD_MS) {
        stats.stopped_for_deadline = true;
        break;
      }
      const candidate = state.pending[index];
      if (tracked.has(candidate.bill)) continue;

      let mentions: number | null;
      try {
        mentions = await deps.countMentions(candidate.bill);
      } catch (error) {
        if (error instanceof ChallengedError) {
          stats.blocked = true;
          pushError("pubinfo returned a Cloudflare challenge; scoring stopped");
          break;
        }
        pushError(`${candidate.bill}: ${message(error)}`);
        mentions = null;
      }

      if (mentions === null) {
        stats.unavailable += 1;
        if (candidate.date >= addDays(today, -PENDING_MAX_AGE_DAYS)) {
          still.push(candidate);
        } else {
          stats.expired += 1;
        }
        continue;
      }

      stats.scored += 1;
      state.scored[candidate.bill] = candidate.date;
      const number = billNumberFromPubinfoId(
        candidate.bill,
        options.yearStart,
        options.yearEnd,
      );
      if (mentions >= options.minMentions && number !== null) {
        stats.admitted += 1;
        state.awaiting.push({
          bill: candidate.bill,
          number,
          mentions,
          since: today,
        });
      } else {
        stats.rejected += 1;
      }
    }
    // Unreadable candidates go to the back so they cannot block the queue.
    state.pending = [...state.pending.slice(index), ...still];

    // 3. Resolve LegiScan ids for admitted bills and insert them.
    state.awaiting = state.awaiting.filter((a) => !tracked.has(a.bill));
    if (state.awaiting.length > 0) {
      if (!options.legiscanAllowed) {
        stats.lookup = "skipped";
        stats.lookup_skipped_reason = "legiscan_unavailable_this_run";
      } else if (deps.now() >= options.deadlineAt - DEADLINE_GUARD_MS) {
        stats.lookup = "skipped";
        stats.lookup_skipped_reason = "deadline";
      } else {
        const result = await deps.resolveIds(
          state.awaiting.map((a) => a.number),
        );
        if (result.status !== "ok") {
          stats.lookup = "skipped";
          stats.lookup_skipped_reason = result.reason;
          if (result.status === "aborted") pushError(result.reason);
        } else {
          stats.lookup = "called";
          const byNumber = new Map(result.matches.map((m) => [m.number, m]));
          const rows: DiscoveredRow[] = [];
          const excluded = new Set<string>();
          for (const waiting of state.awaiting) {
            const match = byNumber.get(waiting.number);
            if (!match) continue;
            if (deps.isExcluded(match.title)) {
              excluded.add(waiting.bill);
              continue;
            }
            rows.push({ bill: waiting.bill, match });
          }
          stats.excluded = excluded.size;

          let inserted: string[] = [];
          if (rows.length > 0) {
            try {
              inserted = await deps.insertBills(rows);
            } catch (error) {
              pushError(`insert: ${message(error)}`);
            }
          }
          stats.inserted = inserted.length;
          // Re-read rather than trust the insert result: a row that already
          // existed is not returned by an insert-only upsert, and must leave
          // the list too.
          tracked = await deps.trackedPubinfoIds();
          state.awaiting = state.awaiting.filter((a) =>
            !tracked.has(a.bill) && !excluded.has(a.bill)
          );
          stats.not_found = state.awaiting.length;
          if (inserted.length > 0) {
            try {
              await deps.onInserted(inserted.length);
            } catch (error) {
              pushError(`enqueue: ${message(error)}`);
            }
          }
        }
      }
    }

    const oldest = addDays(today, -AWAITING_MAX_AGE_DAYS);
    const before = state.awaiting.length;
    state.awaiting = state.awaiting.filter((a) => a.since >= oldest);
    if (state.awaiting.length < before) {
      stats.expired += before - state.awaiting.length;
      pushError(
        `${
          before - state.awaiting.length
        } admitted bill(s) dropped: LegiScan ` +
          `did not list them within ${AWAITING_MAX_AGE_DAYS} days`,
      );
    }
  } catch (error) {
    if (error instanceof ChallengedError) {
      stats.blocked = true;
      pushError("pubinfo returned a Cloudflare challenge");
    } else {
      pushError(message(error));
    }
  }

  stats.pending_after = state.pending.length;
  stats.awaiting = state.awaiting.length;
  stats.finished_at = new Date(deps.now()).toISOString();
  state.last_run = stats;
  await deps.saveState(state);
  return stats;
};
