import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";

import {
  createLegiScanPacer,
  legiScanBudgetLeft,
  legiScanPairFits,
  legiScanWaitMs,
  POLICY_MAX_LEGISCAN_CALLS_PER_INVOCATION,
  POLICY_MIN_LEGISCAN_GAP_MS,
  recordLegiScanCall,
} from "./legiscanPacer.ts";

Deno.test("env overrides can tighten the floors but never loosen them", () => {
  const loose = createLegiScanPacer("200", "50");
  assertEquals(loose.minGapMs, POLICY_MIN_LEGISCAN_GAP_MS);
  assertEquals(loose.maxCalls, POLICY_MAX_LEGISCAN_CALLS_PER_INVOCATION);

  const tight = createLegiScanPacer("3000", "2");
  assertEquals(tight.minGapMs, 3000);
  assertEquals(tight.maxCalls, 2);

  // Garbage falls back to the defaults rather than to zero.
  const garbage = createLegiScanPacer("abc", "-4");
  assertEquals(garbage.minGapMs, 1500);
  assertEquals(garbage.maxCalls, 6);
});

Deno.test("calls are spaced by the gap, measured from the previous call", () => {
  const pacer = createLegiScanPacer(undefined, undefined);
  assertEquals(legiScanWaitMs(pacer, 10_000), 0);
  recordLegiScanCall(pacer, 10_000);
  // The production failure: getBillText ~200 ms after getBill.
  assertEquals(legiScanWaitMs(pacer, 10_200), 1300);
  assertEquals(legiScanWaitMs(pacer, 11_500), 0);
});

Deno.test("a bill starts only when getBill and getBillText both fit", () => {
  const pacer = createLegiScanPacer(undefined, undefined);
  for (let i = 0; i < 4; i += 1) recordLegiScanCall(pacer, i * 2000);
  assert(legiScanPairFits(pacer)); // 4 + 2 = 6
  recordLegiScanCall(pacer, 10_000);
  // One slot left: a lone getBill would spend its reservation for no text.
  assertFalse(legiScanPairFits(pacer));
  assert(legiScanBudgetLeft(pacer));
  recordLegiScanCall(pacer, 12_000);
  assertFalse(legiScanBudgetLeft(pacer));
});
