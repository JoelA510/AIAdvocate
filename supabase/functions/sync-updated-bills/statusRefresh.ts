// Whether refresh-bill-status can be relied on for a bill's status metadata,
// judged from the stats its last run saved (ingestion_cursors
// 'bill_status_refresh'). sync-updated-bills skips LegiScan getBill only
// while this holds.

// The refresh runs daily; two missed runs and sync goes back to getBill.
export const STATUS_REFRESH_MAX_AGE_MS = 48 * 60 * 60 * 1000;
// A bill added since the archive was built is legitimately absent, so
// coverage need not be total, but a missing session or a broken layout shows
// up as a large shortfall.
export const STATUS_REFRESH_MIN_COVERAGE = 0.9;

export const isStatusRefreshHealthy = (
  cursor: unknown,
  nowMs: number,
): boolean => {
  if (!cursor || typeof cursor !== "object") return false;
  const stats = cursor as Record<string, unknown>;
  const finishedAt = Date.parse(String(stats.finished_at ?? ""));
  if (!Number.isFinite(finishedAt)) return false;
  if (nowMs - finishedAt >= STATUS_REFRESH_MAX_AGE_MS) return false;
  if (stats.blocked === true || stats.dry_run === true) return false;

  const num = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : NaN;
  const matched = num(stats.matched);
  const lookedUp = num(stats.tracked) - num(stats.without_pubinfo_id);
  const updateErrors = num(stats.update_errors);
  if (![matched, lookedUp, updateErrors].every(Number.isFinite)) return false;
  // Any failed write means some bill did not get its status.
  if (updateErrors > 0) return false;
  return matched > 0 && lookedUp > 0 &&
    matched / lookedUp >= STATUS_REFRESH_MIN_COVERAGE;
};
