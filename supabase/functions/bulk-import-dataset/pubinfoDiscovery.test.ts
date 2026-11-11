import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";

import type { MasterListMatch } from "./discovery.ts";
import {
  applyResolvedIds,
  awaitingNumbers,
  billNumberFromPubinfoId,
  ChallengedError,
  type DiscoveredRow,
  emptyDiscoveryState,
  planCandidates,
  type PubinfoDiscoveryDeps,
  type PubinfoDiscoveryState,
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

type Mentions = number | null | "challenge" | "error";

const harness = (init: {
  state?: PubinfoDiscoveryState;
  versions: Record<string, string>;
  mentions: Record<string, Mentions>;
  tracked?: string[];
  now?: () => number;
}) => {
  const tracked = new Set(init.tracked ?? []);
  const reads: string[] = [];
  let saved: PubinfoDiscoveryState | null = null;
  const deps: PubinfoDiscoveryDeps = {
    loadState: () =>
      Promise.resolve(structuredClone(init.state ?? emptyDiscoveryState())),
    saveState: (state) => {
      saved = structuredClone(state);
      return Promise.resolve();
    },
    trackedPubinfoIds: () => Promise.resolve(new Set(tracked)),
    loadVersions: () =>
      Promise.resolve({
        versions: new Map(Object.entries(init.versions)),
        archive: "pubinfo_daily_Tue.zip v1",
      }),
    countMentions: (bill) => {
      reads.push(bill);
      const value = init.mentions[bill];
      if (value === "challenge") {
        return Promise.reject(new ChallengedError("cf"));
      }
      if (value === "error") return Promise.reject(new Error("read failed"));
      return Promise.resolve(value === undefined ? 0 : value);
    },
    now: init.now ?? (() => NOW),
  };
  const options = {
    ...SESSION,
    minMentions: 5,
    perRun: 60,
    lookbackDays: 7,
    deadlineAt: NOW + 100_000,
  };
  return { deps, options, reads, saved: () => saved! };
};

const plan = (
  state: PubinfoDiscoveryState,
  versions: Map<string, string>,
  tracked: string[],
  today: string,
) =>
  planCandidates(state, versions, new Set(tracked), SESSION, {
    today,
    lookbackDays: 7,
  });

Deno.test("billNumberFromPubinfoId accepts the regular session only", () => {
  assertEquals(billNumberFromPubinfoId(id("AB1568"), 2025, 2026), "AB1568");
  assertEquals(billNumberFromPubinfoId(id("SCR10"), 2025, 2026), "SCR10");
  // LegiScan's name for an Assembly house resolution.
  assertEquals(billNumberFromPubinfoId(id("HR5"), 2025, 2026), "AR5");
  assertEquals(billNumberFromPubinfoId(id("SR17"), 2025, 2026), "SR17");
  // First extraordinary session, another session, junk.
  assertEquals(billNumberFromPubinfoId("202520261AB1", 2025, 2026), null);
  assertEquals(billNumberFromPubinfoId("202320240AB1", 2025, 2026), null);
  assertEquals(billNumberFromPubinfoId(id("GRP 1"), 2025, 2026), null);
});

Deno.test("first run looks back a week; later runs re-examine a 5-day overlap once", () => {
  const state = emptyDiscoveryState();
  const versions = new Map([
    [id("AB1"), "2026-11-09#99"], // recent
    [id("AB2"), "2026-10-01#99"], // before the lookback
    [id("AB3"), "2026-11-08#99"], // tracked
    ["202520261AB4", "2026-11-09#99"], // special session
    [id("AB5"), "2027-01-01#99"], // future date: ignored, cursor unmoved
  ]);
  assertEquals(plan(state, versions, [id("AB3")], "2026-11-10"), 1);
  assertEquals(state.pending, [
    { bill: id("AB1"), date: "2026-11-09", version: "2026-11-09#99" },
  ]);
  assertEquals(state.scanned_through, "2026-11-09");

  // Next day: AB1 was scored; AB6 shows up late with a date inside the
  // overlap; AB1 is not queued again, AB6 is.
  state.pending = [];
  state.scored[id("AB1")] = "2026-11-09#99";
  versions.set(id("AB6"), "2026-11-06#99");
  assertEquals(plan(state, versions, [id("AB3")], "2026-11-11"), 1);
  assertEquals(state.pending.map((p) => p.bill), [id("AB6")]);

  // AB1 amended again on a later date: the new version queues.
  versions.set(id("AB1"), "2026-11-11#98");
  state.pending = [];
  plan(state, versions, [id("AB3")], "2026-11-11");
  assert(state.pending.some((p) => p.version === "2026-11-11#98"));
  assertEquals(state.scanned_through, "2026-11-11");
});

Deno.test("a second version on the same action date is scored again", async () => {
  const first = harness({
    versions: { [id("AB7")]: "2026-11-09#98" },
    mentions: { [id("AB7")]: 0 },
  });
  await runPubinfoDiscovery(first.deps, first.options);
  assertEquals(first.reads, [id("AB7")]);

  // Same date, next version number, now on topic.
  const second = harness({
    state: first.saved(),
    versions: { [id("AB7")]: "2026-11-09#97" },
    mentions: { [id("AB7")]: 10 },
  });
  const stats = await runPubinfoDiscovery(second.deps, second.options);
  assertEquals(second.reads, [id("AB7")]);
  assertEquals(stats.admitted, 1);

  // Unchanged version: not read a third time (it is awaiting an id).
  const third = harness({
    state: second.saved(),
    versions: { [id("AB7")]: "2026-11-09#97" },
    mentions: {},
  });
  await runPubinfoDiscovery(third.deps, third.options);
  assertEquals(third.reads, []);
});

Deno.test("scores new versions and queues matches for an id lookup", async () => {
  const versions = {
    [id("AB10")]: "2026-11-09#99",
    [id("AB11")]: "2026-11-09#99",
    [id("AB12")]: "2026-11-09#99",
  };
  const h = harness({
    versions,
    mentions: {
      [id("AB10")]: 9, // admitted
      [id("AB11")]: 4, // below threshold
      [id("AB12")]: null, // no text in the archive yet
    },
  });
  const stats = await runPubinfoDiscovery(h.deps, h.options);
  assertEquals(
    [
      stats.new_candidates,
      stats.scored,
      stats.admitted,
      stats.rejected,
      stats.unavailable,
      stats.awaiting,
    ],
    [3, 2, 1, 1, 1, 1],
  );
  const saved = h.saved();
  assertEquals(saved.pending.map((p) => p.bill), [id("AB12")]);
  assertEquals(awaitingNumbers(saved), ["AB10"]);
  assertEquals(saved.last_run?.archive, "pubinfo_daily_Tue.zip v1");

  // Next run, nothing new: only AB12 is read again.
  const again = harness({
    state: saved,
    versions,
    mentions: { [id("AB12")]: 0 },
  });
  const second = await runPubinfoDiscovery(again.deps, again.options);
  assertEquals(again.reads, [id("AB12")]);
  assertEquals([second.new_candidates, second.rejected], [0, 1]);
});

Deno.test("an unreadable candidate does not hold the front of the queue", async () => {
  // perRun 1: the older bill is unreadable every time, the newer one matches.
  const versions = {
    [id("AB20")]: "2026-11-05#99",
    [id("AB21")]: "2026-11-09#99",
  };
  const mentions = { [id("AB20")]: null, [id("AB21")]: 9 } as const;
  const first = harness({ versions, mentions });
  await runPubinfoDiscovery(first.deps, { ...first.options, perRun: 1 });
  assertEquals(first.reads, [id("AB20")]);
  assertEquals(first.saved().pending.map((p) => p.bill), [
    id("AB21"),
    id("AB20"),
  ]);

  const second = harness({ state: first.saved(), versions, mentions });
  const stats = await runPubinfoDiscovery(second.deps, {
    ...second.options,
    perRun: 1,
  });
  // Planning the second run must not sort AB20 back to the front.
  assertEquals(second.reads, [id("AB21")]);
  assertEquals(stats.admitted, 1);
});

Deno.test("a Cloudflare challenge stops scoring and keeps the queue", async () => {
  const h = harness({
    versions: {
      [id("AB10")]: "2026-11-08#99",
      [id("AB11")]: "2026-11-09#99",
    },
    mentions: { [id("AB10")]: "challenge", [id("AB11")]: 9 },
  });
  const stats = await runPubinfoDiscovery(h.deps, h.options);
  assert(stats.blocked);
  assertEquals(h.reads, [id("AB10")]);
  assertEquals(h.saved().pending.map((p) => p.bill), [id("AB10"), id("AB11")]);
});

Deno.test("a read error is recorded and the candidate retried", async () => {
  const h = harness({
    versions: { [id("AB30")]: "2026-11-10#99" },
    mentions: { [id("AB30")]: "error" },
  });
  const stats = await runPubinfoDiscovery(h.deps, h.options);
  assertEquals([stats.scored, stats.unavailable], [0, 1]);
  assert(stats.errors.some((e) => e.includes("read failed")));
  assertEquals(h.saved().pending.map((p) => p.bill), [id("AB30")]);
});

Deno.test("respects the per-run cap and the deadline", async () => {
  const versions: Record<string, string> = {};
  for (let i = 1; i <= 5; i += 1) versions[id(`AB${i}`)] = "2026-11-09#99";
  const capped = harness({ versions, mentions: {} });
  const stats = await runPubinfoDiscovery(capped.deps, {
    ...capped.options,
    perRun: 2,
  });
  assertEquals([stats.scored, stats.pending_after], [2, 3]);

  let now = NOW;
  const late = harness({ versions, mentions: {}, now: () => (now += 40_000) });
  const stopped = await runPubinfoDiscovery(late.deps, late.options);
  assert(stopped.stopped_for_deadline);
  assert(stopped.scored < 5);
});

// --- foreground id resolution -------------------------------------------------

const resolution = (
  awaiting: PubinfoDiscoveryState["awaiting"],
  options: {
    tracked?: string[];
    excludedTitle?: string;
    failInsert?: boolean;
  } = {},
) => {
  const state = { ...emptyDiscoveryState(), awaiting };
  const tracked = new Set(options.tracked ?? []);
  const inserted: DiscoveredRow[] = [];
  return {
    state,
    inserted,
    deps: {
      trackedPubinfoIds: () => Promise.resolve(new Set(tracked)),
      isExcluded: (title: string | null) =>
        options.excludedTitle !== undefined && title === options.excludedTitle,
      insertBills: (rows: DiscoveredRow[]) => {
        if (options.failInsert) return Promise.reject(new Error("db down"));
        inserted.push(...rows);
        rows.forEach((row) => tracked.add(row.bill));
        return Promise.resolve(rows.map((row) => row.bill));
      },
      now: () => NOW,
    },
  };
};

const waiting = (number: string, since = "2026-11-09") => ({
  bill: id(number),
  number,
  mentions: 9,
  since,
});

Deno.test("resolved bills are inserted; the rest keep waiting", async () => {
  const r = resolution([
    waiting("AB10"),
    waiting("AB13"), // LegiScan does not list it yet
    waiting("SB1"), // a budget vehicle
    waiting("AB14"), // already tracked through another path
  ], { excludedTitle: "Budget Act of 2026", tracked: [id("AB14")] });
  const stats = await applyResolvedIds(r.state, [
    match("AB10", 2200010),
    match("SB1", 2200001, "Budget Act of 2026"),
    match("AB14", 2200014),
  ], r.deps);

  assertEquals(
    [stats.requested, stats.inserted, stats.excluded, stats.not_found],
    [4, 1, 1, 1],
  );
  assertEquals(r.inserted.map((row) => row.match.bill_id), [2200010]);
  assertEquals(awaitingNumbers(r.state), ["AB13"]);
  assertEquals(r.state.last_resolution, stats);
});

Deno.test("no lookup this run: nothing inserted, long waits still expire", async () => {
  const r = resolution([waiting("AB20", "2026-10-01"), waiting("AB21")]);
  const stats = await applyResolvedIds(r.state, null, r.deps);
  assertEquals([stats.inserted, stats.expired], [0, 1]);
  assertEquals(awaitingNumbers(r.state), ["AB21"]);
  assert(stats.errors.some((e) => e.includes("did not list them")));
});

Deno.test("a failed insert leaves the bills waiting", async () => {
  const r = resolution([waiting("AB10")], { failInsert: true });
  const stats = await applyResolvedIds(
    r.state,
    [match("AB10", 2200010)],
    r.deps,
  );
  assertEquals(stats.inserted, 0);
  assert(stats.errors.some((e) => e.includes("db down")));
  assertEquals(awaitingNumbers(r.state), ["AB10"]);
});
