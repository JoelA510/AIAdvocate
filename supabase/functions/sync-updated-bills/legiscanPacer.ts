// docs/external-api-policy.md §3 floors for sync-updated-bills' LegiScan
// fallback (getBill + getBillText). Those calls used to go out back to back
// (~200 ms apart in production on 2026-10-27) with no per-run cap. That stayed
// harmless only while leginfo answered first; leginfo now serves a Cloudflare
// challenge to cloud egress, so every bill without stored text reaches the
// fallback. Env can tighten these but never loosen them past the floors, as in
// bulk-import-dataset. CI checks the defaults (check-external-api-usage.js).

export const POLICY_MIN_LEGISCAN_GAP_MS = 1000;
export const POLICY_MAX_LEGISCAN_CALLS_PER_INVOCATION = 6;
export const DEFAULT_SYNC_LEGISCAN_DELAY_MS = 1500;
export const DEFAULT_SYNC_LEGISCAN_MAX_CALLS_PER_RUN = 6;

// Counts HTTP requests, not reservations: a retried getBill is a second request
// to LegiScan, so it spends budget and waits out the gap like any other.
export type LegiScanPacer = {
  maxCalls: number;
  minGapMs: number;
  calls: number;
  lastCallAt: number | null;
};

const parsePositive = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

export const createLegiScanPacer = (
  rawDelayMs: string | undefined,
  rawMaxCalls: string | undefined,
): LegiScanPacer => ({
  minGapMs: Math.max(
    POLICY_MIN_LEGISCAN_GAP_MS,
    Math.min(parsePositive(rawDelayMs, DEFAULT_SYNC_LEGISCAN_DELAY_MS), 10_000),
  ),
  maxCalls: Math.min(
    POLICY_MAX_LEGISCAN_CALLS_PER_INVOCATION,
    parsePositive(rawMaxCalls, DEFAULT_SYNC_LEGISCAN_MAX_CALLS_PER_RUN),
  ),
  calls: 0,
  lastCallAt: null,
});

export const legiScanBudgetLeft = (pacer: LegiScanPacer): boolean =>
  pacer.calls < pacer.maxCalls;

// getBill and getBillText are reserved as a pair: starting a bill that can only
// afford getBill spends a reservation and still yields no text.
export const legiScanPairFits = (pacer: LegiScanPacer): boolean =>
  pacer.calls + 2 <= pacer.maxCalls;

export const legiScanWaitMs = (pacer: LegiScanPacer, now: number): number =>
  pacer.lastCallAt === null
    ? 0
    : Math.max(0, pacer.lastCallAt + pacer.minGapMs - now);

export const recordLegiScanCall = (pacer: LegiScanPacer, now: number): void => {
  pacer.calls += 1;
  pacer.lastCallAt = now;
};
