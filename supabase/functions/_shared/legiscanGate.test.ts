import {
  assert,
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";

import {
  claimLegiScanSlot,
  LegiScanGateError,
  maxGrantRoundTripMs,
  reserveGatedLegiScanCall,
} from "./legiscanGate.ts";

type Step = { data?: unknown; error?: unknown; delayMs?: number };

// Replays one scripted response per rpc() call and records the calls.
const scriptedClient = (steps: Step[]) => {
  const calls: Array<{ name: string; args: unknown; at: number }> = [];
  let i = 0;
  return {
    calls,
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args, at: Date.now() });
      const step = steps[Math.min(i++, steps.length - 1)];
      if (step.delayMs) await new Promise((r) => setTimeout(r, step.delayMs));
      return { data: step.data ?? null, error: step.error ?? null };
    },
  };
};

const reserveArgs = {
  endpoint: "getBillText",
  resourceKey: "3438219",
  cooldownSeconds: 31536000,
  dailyLimit: 900,
  monthlyLimit: 25000,
};

Deno.test("the round-trip budget keeps the 1000 ms floor", () => {
  assertEquals(maxGrantRoundTripMs(1500), 500);
  assertEquals(maxGrantRoundTripMs(3000), 2000);
  // Below the floor the gap is clamped up, leaving no latency budget.
  assertEquals(maxGrantRoundTripMs(800), 0);
});

Deno.test("claim waits out a busy gate, then returns on the grant", async () => {
  const client = scriptedClient([
    { data: { granted: false, retry_after_ms: 60 } },
    { data: { granted: true } },
  ]);
  const started = Date.now();
  await claimLegiScanSlot(client, { minGapMs: 1500 });
  assertEquals(client.calls.length, 2);
  assert(client.calls[1].at - started >= 60);
  assertEquals(client.calls[0].args, { p_min_gap_ms: 1500 });
});

Deno.test("a stale grant on the retry path is dropped and re-claimed", async () => {
  // Gap 1000 => budget 0 ms: the first, slow grant must not be used.
  const client = scriptedClient([
    { data: { granted: true }, delayMs: 30 },
    { data: { granted: true } },
  ]);
  await claimLegiScanSlot(client, { minGapMs: 1000 });
  assertEquals(client.calls.length, 2);
});

Deno.test("a slot past the deadline fails without sleeping", async () => {
  const client = scriptedClient([
    { data: { granted: false, retry_after_ms: 6000 } },
  ]);
  const started = Date.now();
  await assertRejects(
    () => claimLegiScanSlot(client, { deadlineAt: Date.now() + 5000 }),
    LegiScanGateError,
    "past this caller's deadline",
  );
  assert(Date.now() - started < 500);
});

Deno.test("an aborted signal ends the wait", async () => {
  const client = scriptedClient([
    { data: { granted: false, retry_after_ms: 5000 } },
  ]);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);
  await assertRejects(
    () => claimLegiScanSlot(client, { signal: controller.signal }),
    LegiScanGateError,
    "aborted",
  );
});

Deno.test("fails closed when the RPC is missing or throws", async () => {
  await assertRejects(
    () =>
      claimLegiScanSlot(scriptedClient([{
        error: {
          message: "Could not find the function public.claim_legiscan_slot",
        },
      }])),
    LegiScanGateError,
    "claim_legiscan_slot failed",
  );
  await assertRejects(
    () =>
      reserveGatedLegiScanCall({
        rpc: () => Promise.reject(new Error("network down")),
      }, reserveArgs),
    LegiScanGateError,
    "network down",
  );
});

Deno.test("reservation waits for the gate, then returns the grant", async () => {
  const client = scriptedClient([
    { data: { allowed: false, reason: "rate_gate", retry_after_ms: 40 } },
    { data: { allowed: true, endpoint: "getBillText" } },
  ]);
  const reservation = await reserveGatedLegiScanCall(client, reserveArgs, {
    minGapMs: 1500,
  });
  assertEquals(reservation.allowed, true);
  assertEquals(reservation.stale_grant, undefined);
  assertEquals(client.calls.length, 2);
  assertEquals(client.calls[0].name, "reserve_legiscan_api_call_gated");
  assertEquals(
    (client.calls[0].args as Record<string, unknown>).p_min_gap_ms,
    1500,
  );
});

Deno.test("a cooldown denial is returned, not retried", async () => {
  const client = scriptedClient([
    { data: { allowed: false, reason: "cooldown", retry_after_seconds: 99 } },
  ]);
  const reservation = await reserveGatedLegiScanCall(client, reserveArgs);
  assertEquals(reservation.reason, "cooldown");
  assertEquals(client.calls.length, 1);
});

Deno.test("a slow reservation grant is still sent, but flagged", async () => {
  // Refusing would strand a reservation that holds for a year.
  const client = scriptedClient([
    { data: { allowed: true }, delayMs: 30 },
  ]);
  const reservation = await reserveGatedLegiScanCall(client, reserveArgs, {
    minGapMs: 1000,
  });
  assertEquals(reservation.allowed, true);
  assertEquals(reservation.stale_grant, true);
});

Deno.test("a malformed gate response fails closed", async () => {
  await assertRejects(
    () =>
      reserveGatedLegiScanCall(
        scriptedClient([{ data: { ok: 1 } }]),
        reserveArgs,
      ),
    LegiScanGateError,
    "unexpected result",
  );
  await assertRejects(
    () =>
      claimLegiScanSlot(
        scriptedClient([{ data: { granted: false, retry_after_ms: "soon" } }]),
      ),
    LegiScanGateError,
    "retry_after_ms",
  );
});
