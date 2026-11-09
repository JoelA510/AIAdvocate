// Cross-invocation LegiScan spacing (docs/external-api-policy.md §3).
//
// Per-invocation pacers cannot see each other: parallel sync-updated-bills
// workers and bulk-import-dataset each kept their own gap, so production saw
// LegiScan requests from different invocations 1-92 ms apart. Every LegiScan
// request therefore claims a slot from public.claim_legiscan_slot (migration
// 20261109120000) immediately before it is sent, and sleeps until that slot.

export const DEFAULT_LEGISCAN_GLOBAL_GAP_MS = 1500;

// Thrown when the gate cannot be consulted. Callers must treat it like a
// LegiScan API error: send nothing further this run. Failing open would
// restore exactly the unspaced traffic the gate exists to prevent.
export class LegiScanGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LegiScanGateError";
  }
}

// Reject a wait the caller could not sensibly sit through: it means the slot
// queue is far longer than any legitimate fan-out produces (6 calls x a few
// workers), so something is looping.
const MAX_GATE_WAIT_MS = 60_000;

export const parseGateWaitMs = (data: unknown): number => {
  const wait = Number((data as { wait_ms?: unknown } | null)?.wait_ms);
  if (!Number.isFinite(wait) || wait < 0) {
    throw new LegiScanGateError(
      `claim_legiscan_slot returned no usable wait_ms: ${JSON.stringify(data)}`,
    );
  }
  if (wait > MAX_GATE_WAIT_MS) {
    throw new LegiScanGateError(
      `claim_legiscan_slot asked for a ${wait} ms wait; refusing to queue that deep`,
    );
  }
  return Math.ceil(wait);
};

export const claimLegiScanSlot = async (
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
  minGapMs: number = DEFAULT_LEGISCAN_GLOBAL_GAP_MS,
): Promise<void> => {
  let data: unknown;
  try {
    const result = await supabaseAdmin.rpc("claim_legiscan_slot", {
      p_min_gap_ms: minGapMs,
    });
    if (result.error) {
      throw new Error(result.error.message ?? String(result.error));
    }
    data = result.data;
  } catch (error) {
    throw new LegiScanGateError(
      `claim_legiscan_slot failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const wait = parseGateWaitMs(data);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
};
