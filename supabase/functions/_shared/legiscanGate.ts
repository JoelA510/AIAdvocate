// Cross-invocation LegiScan spacing (docs/external-api-policy.md §3).
//
// Per-invocation pacers cannot see each other: parallel sync-updated-bills
// workers and bulk-import-dataset each kept their own gap, so production saw
// LegiScan requests from different invocations 1-92 ms apart. Every LegiScan
// request now passes the database gate from migration 20261109120000:
//
//   first attempt  reserveGatedLegiScanCall -> reserve_legiscan_api_call_gated
//                  (quota reservation + slot grant in one transaction, so a
//                  busy or unreachable gate never consumes a reservation)
//   retries        claimLegiScanSlot -> claim_legiscan_slot
//
// The gate grants a slot only when it is due; callers poll until then and send
// immediately on a grant. Spacing can shrink only by the grant RPC's response
// latency, so a grant whose round trip exceeded gap - 1000 ms is treated as
// stale: refused and re-claimed when nothing is at stake, flagged otherwise.

export const DEFAULT_LEGISCAN_GLOBAL_GAP_MS = 1500;
const POLICY_FLOOR_MS = 1000;
// Upper bound on how long any caller waits for the gate when it gives no
// deadline of its own. Legitimate queues are a few callers x a few seconds.
const DEFAULT_GATE_WAIT_MS = 30_000;

// Thrown when the gate cannot be consulted or no slot arrives in time. Nothing
// was sent and, for the reservation path, nothing was reserved. Callers treat
// it like a LegiScan API error: send nothing further this run.
export class LegiScanGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegiScanGateError";
  }
}

export type GateOptions = {
  minGapMs?: number;
  deadlineAt?: number;
  signal?: AbortSignal;
};

export type GatedReservation = {
  allowed: boolean;
  reason?: string;
  retry_after_seconds?: number;
  // True when the grant's round trip exceeded the latency budget; the request
  // is still sent (refusing would strand the reservation) but is logged.
  stale_grant?: boolean;
  [key: string]: unknown;
};

const gapOf = (minGapMs: number | undefined) =>
  Math.max(POLICY_FLOOR_MS, minGapMs ?? DEFAULT_LEGISCAN_GLOBAL_GAP_MS);

/** Round trip above which a grant no longer guarantees the 1000 ms floor. */
export const maxGrantRoundTripMs = (gapMs: number): number =>
  Math.max(0, gapOf(gapMs) - POLICY_FLOOR_MS);

const sleepUntilRetry = async (
  retryAfterMs: unknown,
  deadlineAt: number,
  signal: AbortSignal | undefined,
): Promise<void> => {
  const wait = Number(retryAfterMs);
  if (!Number.isFinite(wait) || wait < 0) {
    throw new LegiScanGateError(
      `LegiScan gate returned no usable retry_after_ms: ${
        String(retryAfterMs)
      }`,
    );
  }
  // +10 ms so the retry lands after the slot, not on its edge.
  const sleepMs = Math.ceil(wait) + 10;
  if (Date.now() + sleepMs > deadlineAt) {
    throw new LegiScanGateError(
      `LegiScan gate slot is ${sleepMs} ms away, past this caller's deadline`,
    );
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, sleepMs);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new LegiScanGateError("LegiScan gate wait aborted"));
    }, { once: true });
  });
};

const checkLive = (deadlineAt: number, signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new LegiScanGateError("LegiScan gate wait aborted");
  }
  if (Date.now() >= deadlineAt) {
    throw new LegiScanGateError("LegiScan gate deadline reached");
  }
};

// deno-lint-ignore no-explicit-any
const callRpc = async (supabaseAdmin: any, name: string, args: unknown) => {
  try {
    const result = await supabaseAdmin.rpc(name, args);
    if (result.error) {
      throw new Error(result.error.message ?? String(result.error));
    }
    return result.data as Record<string, unknown> | null;
  } catch (error) {
    throw new LegiScanGateError(
      `${name} failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

/**
 * Retry path: wait for and take a slot for a request whose reservation was
 * already made (and whose first attempt was sent). Resolves when the caller
 * may send immediately.
 */
export const claimLegiScanSlot = async (
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  options: GateOptions = {},
): Promise<void> => {
  const gapMs = gapOf(options.minGapMs);
  const deadlineAt = options.deadlineAt ?? Date.now() + DEFAULT_GATE_WAIT_MS;
  for (;;) {
    checkLive(deadlineAt, options.signal);
    const started = Date.now();
    const data = await callRpc(supabaseAdmin, "claim_legiscan_slot", {
      p_min_gap_ms: gapMs,
    });
    if (data?.granted === true) {
      // A slow grant may land on top of the next caller's slot. Nothing is
      // reserved on this path, so drop it and queue for a fresh one.
      if (Date.now() - started <= maxGrantRoundTripMs(gapMs)) return;
      continue;
    }
    if (data?.granted !== false) {
      throw new LegiScanGateError(
        `claim_legiscan_slot returned an unexpected result: ${
          JSON.stringify(data)
        }`,
      );
    }
    await sleepUntilRetry(data.retry_after_ms, deadlineAt, options.signal);
  }
};

/**
 * First attempt: reserve the call (cooldown/quota) and take a slot together.
 * Returns the reservation; when `allowed`, the caller must send immediately.
 * A busy gate is waited out; an unreachable gate or a missed deadline throws
 * LegiScanGateError with no reservation made.
 */
export const reserveGatedLegiScanCall = async (
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  args: {
    endpoint: string;
    resourceKey: string;
    cooldownSeconds: number;
    dailyLimit: number;
    monthlyLimit: number;
  },
  options: GateOptions = {},
): Promise<GatedReservation> => {
  const gapMs = gapOf(options.minGapMs);
  const deadlineAt = options.deadlineAt ?? Date.now() + DEFAULT_GATE_WAIT_MS;
  for (;;) {
    checkLive(deadlineAt, options.signal);
    const started = Date.now();
    const data = await callRpc(
      supabaseAdmin,
      "reserve_legiscan_api_call_gated",
      {
        p_endpoint: args.endpoint,
        p_resource_key: args.resourceKey,
        p_cooldown_seconds: args.cooldownSeconds,
        p_daily_limit: args.dailyLimit,
        p_monthly_limit: args.monthlyLimit,
        p_min_gap_ms: gapMs,
      },
    );
    if (!data || typeof data.allowed !== "boolean") {
      throw new LegiScanGateError(
        `reserve_legiscan_api_call_gated returned an unexpected result: ${
          JSON.stringify(data)
        }`,
      );
    }
    if (!data.allowed && data.reason === "rate_gate") {
      await sleepUntilRetry(data.retry_after_ms, deadlineAt, options.signal);
      continue;
    }
    const reservation = data as GatedReservation;
    if (reservation.allowed) {
      const roundTrip = Date.now() - started;
      if (roundTrip > maxGrantRoundTripMs(gapMs)) {
        // The reservation is already recorded (for getBillText, for a year), so
        // refusing to send would strand it; send and leave a trace instead.
        reservation.stale_grant = true;
        console.warn("LegiScan gate grant arrived late", {
          endpoint: args.endpoint,
          round_trip_ms: roundTrip,
          budget_ms: maxGrantRoundTripMs(gapMs),
        });
      }
    }
    return reservation;
  }
};
