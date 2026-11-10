// Daily status refresh: status, status date, history, progress and hearings
// for every tracked bill, from the Legislature's pubinfo tables. No LegiScan
// calls. See docs/plans/2026-11-10-pubinfo-primary-plan.md.

import {
  type ArchiveHead,
  billIdFromStateLink,
  freshestDailyArchive,
  headPubinfoArchive,
  loadPubinfoTables,
  PubinfoFetchError,
  pubinfoUrlForSession,
} from "../_shared/pubinfo.ts";
import {
  buildBillStatuses,
  type CalendarEntry,
  type PubinfoBillStatus,
  STATUS_TABLES,
} from "../_shared/pubinfoStatus.ts";

export type TrackedBill = {
  id: number;
  state_link: string | null;
  status: string | null;
  status_date: string | null;
  history: unknown;
  progress: unknown;
  calendar: unknown;
};

export type StatusUpdate = Partial<
  Pick<PubinfoBillStatus, "status" | "status_date" | "history" | "progress"> & {
    calendar: CalendarEntry[];
  }
>;

export type RefreshStats = {
  started_at: string;
  finished_at: string | null;
  dry_run: boolean;
  tracked: number;
  without_pubinfo_id: number;
  matched: number;
  not_in_pubinfo: number;
  updated: number;
  unchanged: number;
  update_errors: number;
  blocked: boolean;
  unknown_statuses: string[];
  archives: Array<{ session: number; file: string; version: string }>;
  errors: string[];
  // Dry runs only: a few of the changes that would be written.
  samples?: Array<{ id: number; bill: string; changes: StatusUpdate }>;
};

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type RefreshDeps = {
  listBills: () => Promise<TrackedBill[]>;
  updateBill: (id: number, changes: StatusUpdate) => Promise<void>;
  saveStats: (stats: RefreshStats) => Promise<void>;
  fetchImpl?: FetchLike;
  now?: Date;
};

const MAX_ERRORS = 10;
const UPDATE_CONCURRENCY = 8;
const MAX_SAMPLES = 5;

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The fields to write for one bill, or null when nothing changed. Empty
 * pubinfo history or progress never replaces stored data, and neither does a
 * calendar from an archive whose hearing table was missing: a table absent
 * from one day's archive must not blank what the app shows.
 */
export const diffBillStatus = (
  bill: TrackedBill,
  next: PubinfoBillStatus,
): StatusUpdate | null => {
  const changes: StatusUpdate = {};
  if (bill.status !== next.status) changes.status = next.status;
  if (next.status_date && bill.status_date !== next.status_date) {
    changes.status_date = next.status_date;
  }
  if (next.history.length > 0 && !same(bill.history, next.history)) {
    changes.history = next.history;
  }
  if (next.progress.length > 0 && !same(bill.progress, next.progress)) {
    changes.progress = next.progress;
  }
  // The calendar can be emptied (a canceled hearing must stop showing and
  // stop triggering reminders), but only when the hearing table itself loaded.
  if (next.calendar !== null && !same(bill.calendar ?? [], next.calendar)) {
    changes.calendar = next.calendar;
  }
  return Object.keys(changes).length > 0 ? changes : null;
};

const sessionOf = (pubinfoId: string): number | null => {
  const match = /^(\d{4})(\d{4})\d[A-Z]+\d+$/.exec(pubinfoId);
  if (!match) return null;
  const start = Number(match[1]);
  return Number(match[2]) === start + 1 ? start : null;
};

export const refreshBillStatuses = async (
  deps: RefreshDeps,
  options: { dryRun?: boolean } = {},
): Promise<RefreshStats> => {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? new Date();
  const dryRun = options.dryRun === true;
  const stats: RefreshStats = {
    started_at: now.toISOString(),
    finished_at: null,
    dry_run: dryRun,
    tracked: 0,
    without_pubinfo_id: 0,
    matched: 0,
    not_in_pubinfo: 0,
    updated: 0,
    unchanged: 0,
    update_errors: 0,
    blocked: false,
    unknown_statuses: [],
    archives: [],
    errors: [],
  };
  if (dryRun) stats.samples = [];
  const pushError = (message: string) => {
    if (stats.errors.length < MAX_ERRORS) stats.errors.push(message);
  };

  try {
    const bills = await deps.listBills();
    stats.tracked = bills.length;

    const bySession = new Map<number, Map<string, TrackedBill>>();
    for (const bill of bills) {
      const pubinfoId = billIdFromStateLink(bill.state_link);
      const session = pubinfoId ? sessionOf(pubinfoId) : null;
      if (!pubinfoId || session === null) {
        stats.without_pubinfo_id += 1;
        continue;
      }
      const group = bySession.get(session) ?? new Map();
      group.set(pubinfoId, bill);
      bySession.set(session, group);
    }

    let daily: { url: string; head: ArchiveHead } | null | undefined;
    const unknown = new Set<string>();
    const pending: Array<{ bill: TrackedBill; changes: StatusUpdate }> = [];

    for (const [session, group] of bySession) {
      const wanted = new Set(group.keys());
      let statuses: Map<string, PubinfoBillStatus> | null = null;

      // The daily archive first (current session, rebuilt daily), then the
      // session archive (weekly; the only source after a session ends).
      const candidates: Array<
        () => Promise<{ url: string; head: ArchiveHead } | null>
      > = [
        async () => {
          if (daily === undefined) {
            daily = await freshestDailyArchive(fetchImpl, now);
          }
          return daily;
        },
        async () => {
          const url = pubinfoUrlForSession(session);
          return { url, head: await headPubinfoArchive(url, fetchImpl) };
        },
      ];

      for (const candidate of candidates) {
        try {
          const archive = await candidate();
          if (!archive) continue;
          const tables = await loadPubinfoTables(
            archive.url,
            archive.head,
            Object.values(STATUS_TABLES),
            fetchImpl,
          );
          const bill = tables.get(STATUS_TABLES.bill);
          const history = tables.get(STATUS_TABLES.history);
          if (bill === undefined || history === undefined) {
            pushError(`${archive.url}: BILL_TBL or BILL_HISTORY_TBL missing`);
            continue;
          }
          const built = buildBillStatuses({
            bill,
            history,
            hearing: tables.get(STATUS_TABLES.hearing),
            location: tables.get(STATUS_TABLES.location),
            agenda: tables.get(STATUS_TABLES.agenda),
          }, wanted);
          // None of this session's bills: the archive is another session's.
          if (built.statuses.size === 0) continue;
          statuses = built.statuses;
          built.unknownStatuses.forEach((value) => unknown.add(value));
          stats.archives.push({
            session,
            file: archive.url.slice(archive.url.lastIndexOf("/") + 1),
            version: archive.head.version,
          });
          break;
        } catch (error) {
          if (error instanceof PubinfoFetchError && error.challenged) {
            throw error;
          }
          pushError(error instanceof Error ? error.message : String(error));
        }
      }

      if (!statuses) {
        stats.not_in_pubinfo += group.size;
        pushError(`session ${session}: no pubinfo archive had its bills`);
        continue;
      }

      for (const [pubinfoId, bill] of group) {
        const next = statuses.get(pubinfoId);
        if (!next) {
          stats.not_in_pubinfo += 1;
          continue;
        }
        stats.matched += 1;
        const changes = diffBillStatus(bill, next);
        if (!changes) {
          stats.unchanged += 1;
          continue;
        }
        pending.push({ bill, changes });
        if (stats.samples && stats.samples.length < MAX_SAMPLES) {
          stats.samples.push({ id: bill.id, bill: pubinfoId, changes });
        }
      }
    }

    stats.unknown_statuses = Array.from(unknown).sort();

    if (dryRun) {
      stats.updated = pending.length;
    } else {
      for (let i = 0; i < pending.length; i += UPDATE_CONCURRENCY) {
        await Promise.all(
          pending.slice(i, i + UPDATE_CONCURRENCY).map(
            async ({ bill, changes }) => {
              try {
                await deps.updateBill(bill.id, changes);
                stats.updated += 1;
              } catch (error) {
                stats.update_errors += 1;
                pushError(
                  `bill ${bill.id}: ${
                    error instanceof Error ? error.message : String(error)
                  }`,
                );
              }
            },
          ),
        );
      }
    }
  } catch (error) {
    if (error instanceof PubinfoFetchError && error.challenged) {
      stats.blocked = true;
    }
    pushError(error instanceof Error ? error.message : String(error));
  }

  stats.finished_at = new Date().toISOString();
  if (!dryRun) {
    try {
      await deps.saveStats(stats);
    } catch (error) {
      pushError(
        `stats not saved: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return stats;
};
