import {
  assert,
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";

import {
  claimLegiScanSlot,
  LegiScanGateError,
  parseGateWaitMs,
} from "./legiscanGate.ts";

const fakeClient = (result: { data?: unknown; error?: unknown }) => {
  const calls: unknown[] = [];
  return {
    calls,
    rpc: (name: string, args: unknown) => {
      calls.push({ name, args });
      return Promise.resolve(result);
    },
  };
};

Deno.test("sleeps for the slot the gate hands out", async () => {
  const client = fakeClient({ data: { wait_ms: 120 } });
  const started = Date.now();
  await claimLegiScanSlot(client, 1500);
  assert(Date.now() - started >= 110);
  assertEquals(client.calls, [{
    name: "claim_legiscan_slot",
    args: { p_min_gap_ms: 1500 },
  }]);
});

Deno.test("fails closed when the RPC is missing (migration not applied)", async () => {
  const client = fakeClient({
    error: {
      message: "Could not find the function public.claim_legiscan_slot",
    },
  });
  await assertRejects(
    () => claimLegiScanSlot(client),
    LegiScanGateError,
    "claim_legiscan_slot failed",
  );
});

Deno.test("fails closed when the client itself throws", async () => {
  const client = {
    rpc: () => Promise.reject(new Error("network down")),
  };
  await assertRejects(
    () => claimLegiScanSlot(client),
    LegiScanGateError,
    "network down",
  );
});

Deno.test("rejects malformed or runaway waits instead of sending", () => {
  assertThrows(() => parseGateWaitMs(null), LegiScanGateError);
  assertThrows(() => parseGateWaitMs({ wait_ms: "soon" }), LegiScanGateError);
  assertThrows(() => parseGateWaitMs({ wait_ms: -5 }), LegiScanGateError);
  assertThrows(() => parseGateWaitMs({ wait_ms: 600_000 }), LegiScanGateError);
  assertEquals(parseGateWaitMs({ wait_ms: 0 }), 0);
  assertEquals(parseGateWaitMs({ wait_ms: 1499.2 }), 1500);
});
