import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";

import type { MasterListMatch } from "./discovery.ts";
import {
  billNumberFromPubinfoId,
  ChallengedError,
  type DiscoveredRow,
  emptyDiscoveryState,
  planCandidates,
  type PubinfoDiscoveryDeps,
  type PubinfoDiscoveryState,
  type ResolveResult,
  runPubinfoDiscovery,
} from "./pubinfoDiscovery.ts";

const SESSION = { yearStart: 2025, yearEnd: 2026 };
const id = (number: string) => `202520260${number}`;
const NOW = Date.parse("2026-11-10T10:00:30Z");

const match = (
  number: string,
  billId: number,
  title = number,
): MasterListMatch => ({
  bill_id: billId,
  number,
  title,
  description: null,
  change_hash: "h",
});

const harness = (init: {
  state?: PubinfoDiscoveryState;
  dates: Record<string, string>;
  mentions: Record<string, number | null | "challenge" | "error">;
  tracked?: string[];
  resolve?: (numbers: string[]) => ResolveResult;
  excludedTitle?: string;
  now?: () => number;
}) => {
  const tracked = new Set(init.tracked ?? []);
  const calls = {
    resolve: [] as string[][],
    reads: [] as string[],
    enqueued: 0,
  };
  let saved: PubinfoDiscoveryState | null = null;
  const deps: PubinfoDiscoveryDeps = {
    loadState: () =>
      Promise.resolve(structuredClone(init.state ?? emptyDiscoveryState())),
    saveState: (state) => {
      saved = structuredClone(state);
      return Promise.resolve();
    },
    trackedPubinfoIds: () => Promise.resolve(new Set(tracked)),
    loadVersionDates: () =>
      Promise.resolve({
        dates: new Map(Object.entries(init.dates)),
        archive: "pubinfo_daily_Tue.zip v1",
      }),
    countMentions: (bill) => {
      calls.reads.push(bill);
      const value = init.mentions[bill];
      if (value === "challenge") {
        return Promise.reject(new ChallengedError("cf"));
      }
      if (value === "error") return Promise.reject(new Error("read failed"));
      return Promise.resolve(value === undefined ? 0 : value);
    },
    resolveIds: (numbers) => {
      calls.resolve.push(numbers);
      return Promise.resolve(
        init.resolve ? init.resolve(numbers) : { status: "ok", matches: [] },
      );
    },
    isExcluded: (title) =>
      init.excludedTitle !== undefined && title === init.excludedTitle,
    insertBills: (rows: DiscoveredRow[]) => {
      rows.forEach((row) => tracked.add(row.bill));
      return Promise.resolve(rows.map((row) => row.bill));
    },
    onInserted: (count) => {
      calls.enqueued += count;
      return Promise.resolve();
    },
    now: init.now ?? (() => NOW),
  };
  const options = {
    ...SESSION,
    minMentions: 5,
    perRun: 60,
    lookbackDays: 7,
    deadlineAt: NOW + 100_000,
    legiscanAllowed: true,
  };
  return { deps, options, calls, saved: () => saved!, tracked };
};

Deno.test("billNumberFromPubinfoId accepts the regular session only", () => {
  assertEquals(billNumberFromPubinfoId(id("AB1568"), 2025, 2026), "AB1568");
  assertEquals(billNumberFromPubinfoId(id("SCR10"), 2025, 2026), "SCR10");
  // First extraordinary session, another session, junk.
  assertEquals(billNumberFromPubinfoId("202520261AB1", 2025, 2026), null);
  assertEquals(billNumberFromPubinfoId("202320240AB1", 2025, 2026), null);
  assertEquals(billNumberFromPubinfoId(id("GRP 1"), 2025, 2026), null);
});

Deno.test("first run looks back a week; later runs re-examine a 5-day overlap once", () => {
  const state = emptyDiscoveryState();
  const dates = new Map([
    [id("AB1"), "2026-11-09"], // recent
    [id("AB2"), "2026-10-01"], // before the lookback
    [id("AB3"), "2026-11-08"], // tracked
    ["202520261AB4", "2026-11-09"], // special session
    [id("AB5"), "2027-01-01"], // future date: ignored, cursor unmoved
  ]);
  const added = planCandidates(state, dates, new Set([id("AB3")]), SESSION, {
    today: "2026-11-10",
    lookbackDays: 7,
  });
  assertEquals(added, 1);
  assertEquals(state.pending, [{ bill: id("AB1"), date: "2026-11-09" }]);
  assertEquals(state.scanned_through, "2026-11-09");

  // Next day: AB1 was scored; AB6 shows up late with a date inside the
  // overlap; AB1 is not queued again, AB6 is.
  state.pending = [];
  state.scored[id("AB1")] = "2026-11-09";
  dates.set(id("AB6"), "2026-11-06");
  assertEquals(
    planCandidates(state, dates, new Set([id("AB3")]), SESSION, {
      today: "2026-11-11",
      lookbackDays: 7,
    }),
    1,
  );
  assertEquals(state.pending, [{ bill: id("AB6"), date: "2026-11-06" }]);

  // AB1 amended again: scored at the old date, so the new version queues.
  dates.set(id("AB1"), "2026-11-11");
  state.pending = [];
  planCandidates(state, dates, new Set([id("AB3")]), SESSION, {
    today: "2026-11-11",
    lookbackDays: 7,
  });
  assert(
    state.pending.some((p) => p.bill === id("AB1") && p.date === "2026-11-11"),
  );
  assertEquals(state.scanned_through, "2026-11-11");
});

Deno.test("admits bills at the mention threshold and inserts them with LegiScan ids", async () => {
  const h = harness({
    dates: {
      [id("AB10")]: "2026-11-09",
      [id("AB11")]: "2026-11-09",
      [id("AB12")]: "2026-11-09",
      [id("AB13")]: "2026-11-09",
    },
    mentions: {
      [id("AB10")]: 9, // admitted
      [id("AB11")]: 4, // below threshold
      [id("AB12")]: null, // no text in the archive yet
      [id("AB13")]: 6, // admitted, but LegiScan does not list it yet
    },
    resolve: () => ({ status: "ok", matches: [match("AB10", 2200010)] }),
  });
  const stats = await runPubinfoDiscovery(h.deps, h.options);

  assertEquals(
    [
      stats.new_candidates,
      stats.scored,
      stats.admitted,
      stats.rejected,
      stats.unavailable,
    ],
    [4, 3, 2, 1, 1],
  );
  assertEquals(h.calls.resolve, [["AB10", "AB13"]]);
  assertEquals([stats.lookup, stats.inserted, stats.not_found], [
    "called",
    1,
    1,
  ]);
  assertEquals(h.calls.enqueued, 1);
  const saved = h.saved();
  // AB12 retries; AB13 waits for LegiScan; AB10 is done; AB11 is forgotten.
  assertEquals(saved.pending, [{ bill: id("AB12"), date: "2026-11-09" }]);
  assertEquals(saved.awaiting.map((a) => a.number), ["AB13"]);
  assertEquals(saved.last_run?.archive, "pubinfo_daily_Tue.zip v1");

  // Second run, nothing new: only AB12 is read again, AB11 is not re-scored,
  // and the lookup is asked for AB13 alone.
  const again = harness({
    state: saved,
    dates: {
      [id("AB10")]: "2026-11-09",
      [id("AB11")]: "2026-11-09",
      [id("AB12")]: "2026-11-09",
      [id("AB13")]: "2026-11-09",
    },
    mentions: { [id("AB12")]: 0 },
    tracked: [id("AB10")],
  });
  const second = await runPubinfoDiscovery(again.deps, again.options);
  assertEquals(again.calls.reads, [id("AB12")]);
  assertEquals(again.calls.resolve, [["AB13"]]);
  assertEquals([second.new_candidates, second.rejected], [0, 1]);
});

Deno.test("no admitted bills means no LegiScan call", async () => {
  const h = harness({
    dates: { [id("AB10")]: "2026-11-09" },
    mentions: { [id("AB10")]: 1 },
  });
  const stats = await runPubinfoDiscovery(h.deps, h.options);
  assertEquals(h.calls.resolve, []);
  assertEquals(stats.lookup, "not_needed");
});

Deno.test("LegiScan unavailable: scoring still runs, admitted bills wait", async () => {
  const h = harness({
    dates: { [id("AB10")]: "2026-11-09" },
    mentions: { [id("AB10")]: 9 },
  });
  const stats = await runPubinfoDiscovery(h.deps, {
    ...h.options,
    legiscanAllowed: false,
  });
  assertEquals(h.calls.resolve, []);
  assertEquals(
    [stats.admitted, stats.lookup, stats.lookup_skipped_reason, stats.awaiting],
    [1, "skipped", "legiscan_unavailable_this_run", 1],
  );

  // A denied reservation (cooldown) or an API error leaves them waiting too.
  for (
    const result of [
      { status: "skipped", reason: "cooldown" },
      { status: "aborted", reason: "LegiScan getMasterList returned ERROR" },
    ] as ResolveResult[]
  ) {
    const next = harness({
      state: h.saved(),
      dates: {},
      mentions: {},
      resolve: () => result,
    });
    const s = await runPubinfoDiscovery(next.deps, next.options);
    assertEquals([s.lookup, s.awaiting, s.inserted], ["skipped", 1, 0]);
  }
});

Deno.test("a Cloudflare challenge stops scoring and keeps the queue", async () => {
  const h = harness({
    dates: { [id("AB10")]: "2026-11-08", [id("AB11")]: "2026-11-09" },
    mentions: { [id("AB10")]: "challenge", [id("AB11")]: 9 },
  });
  const stats = await runPubinfoDiscovery(h.deps, h.options);
  assert(stats.blocked);
  assertEquals(h.calls.reads, [id("AB10")]);
  assertEquals(h.saved().pending.map((p) => p.bill), [id("AB10"), id("AB11")]);
});

Deno.test("an excluded vehicle is dropped; a read error retries; old waits expire", async () => {
  const h = harness({
    state: {
      ...emptyDiscoveryState(),
      scanned_through: "2026-11-09",
      awaiting: [
        { bill: id("AB20"), number: "AB20", mentions: 9, since: "2026-10-01" },
        { bill: id("SB1"), number: "SB1", mentions: 9, since: "2026-11-09" },
      ],
    },
    dates: { [id("AB30")]: "2026-11-10" },
    mentions: { [id("AB30")]: "error" },
    resolve: () => ({
      status: "ok",
      matches: [match("SB1", 2200001, "Budget Act of 2026")],
    }),
    excludedTitle: "Budget Act of 2026",
  });
  const stats = await runPubinfoDiscovery(h.deps, h.options);
  assertEquals([stats.excluded, stats.inserted], [1, 0]);
  // AB20 waited 40 days for an id: dropped and reported.
  assertEquals(stats.expired, 1);
  assertEquals(h.saved().awaiting, []);
  assert(stats.errors.some((e) => e.includes("did not list them")));
  // The failed read stays queued.
  assertEquals(h.saved().pending.map((p) => p.bill), [id("AB30")]);
  assertEquals(stats.unavailable, 1);
});

Deno.test("respects the per-run cap and the deadline", async () => {
  const dates: Record<string, string> = {};
  const mentions: Record<string, number> = {};
  for (let i = 1; i <= 5; i += 1) {
    dates[id(`AB${i}`)] = "2026-11-09";
    mentions[id(`AB${i}`)] = 0;
  }
  const capped = harness({ dates, mentions });
  const stats = await runPubinfoDiscovery(capped.deps, {
    ...capped.options,
    perRun: 2,
  });
  assertEquals([stats.scored, stats.pending_after], [2, 3]);

  let now = NOW;
  const late = harness({ dates, mentions, now: () => (now += 40_000) });
  const stopped = await runPubinfoDiscovery(late.deps, late.options);
  assert(stopped.stopped_for_deadline);
  assert(stopped.scored < 5);
});
