import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";
import JSZip from "npm:jszip";

import {
  diffBillStatus,
  refreshBillStatuses,
  type RefreshStats,
  type StatusUpdate,
  type TrackedBill,
} from "./refresh.ts";

const q = (v: string | null) => (v === null ? "NULL" : `\`${v}\``);
const billRow = (id: string, state: string, house: string, status: string) =>
  [
    q(id),
    q("20252026"),
    q("0"),
    q("AB"),
    "1",
    q(state),
    "NULL",
    "NULL",
    "NULL",
    "NULL",
    q("v"),
    q("Y"),
    q("HS_INT"),
    "2026-10-15 16:14:13",
    "NULL",
    "NULL",
    q(house),
    q(status),
    "2026-02-12 00:00:00",
  ].join("\t");
const historyRow = (
  id: string,
  seq: number,
  date: string,
  action: string,
  end: string,
) =>
  [
    q(id),
    String(seq),
    `${date} 00:00:00`,
    q(action),
    q("LEG_ESI"),
    "2026-11-03 12:43:49",
    String(seq),
    q("6"),
    q("Applied"),
    q("Assembly"),
    "NULL",
    "NULL",
    q(end),
  ].join("\t");

const archive = async (files: Record<string, string>) => {
  const zip = new JSZip();
  for (const [name, text] of Object.entries(files)) zip.file(name, text);
  return await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
};

type Served = { bytes: Uint8Array; lastModified: string } | number;
const server =
  (files: Record<string, Served>, requests: string[] = []) =>
  (url: string, init?: RequestInit): Promise<Response> => {
    const name = url.slice(url.lastIndexOf("/") + 1);
    const file = files[name];
    requests.push(`${init?.method ?? "GET"} ${name}`);
    if (file === undefined) {
      return Promise.resolve(new Response("not found", { status: 404 }));
    }
    if (typeof file === "number") {
      return Promise.resolve(
        new Response("Just a moment...", {
          status: file,
          headers: { "cf-mitigated": "challenge" },
        }),
      );
    }
    if (init?.method === "HEAD") {
      return Promise.resolve(
        new Response(null, {
          status: 200,
          headers: {
            "content-length": String(file.bytes.length),
            "last-modified": file.lastModified,
          },
        }),
      );
    }
    const match = /^bytes=(\d+)-(\d+)$/.exec(
      new Headers(init?.headers).get("Range") ?? "",
    )!;
    return Promise.resolve(
      new Response(
        file.bytes.slice(
          Number(match[1]),
          Math.min(Number(match[2]), file.bytes.length - 1) + 1,
        ),
        { status: 206 },
      ),
    );
  };

const NOW = new Date("2026-11-10T22:00:00Z");
const FRESH = "Tue, 10 Nov 2026 05:23:00 GMT";
const link = (id: string) =>
  `https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=${id}`;
const tracked = (id: number, pubinfoId: string | null): TrackedBill => ({
  id,
  state_link: pubinfoId ? link(pubinfoId) : null,
  status: null,
  status_date: null,
  history: [],
  progress: [],
  calendar: [],
});

const harness = (bills: TrackedBill[]) => {
  const updates = new Map<number, StatusUpdate>();
  const saved: RefreshStats[] = [];
  return {
    updates,
    saved,
    deps: {
      listBills: () => Promise.resolve(bills),
      updateBill: (id: number, changes: StatusUpdate) => {
        if (id === 666) return Promise.reject(new Error("write failed"));
        updates.set(id, changes);
        const bill = bills.find((b) => b.id === id)!;
        Object.assign(bill, changes);
        return Promise.resolve();
      },
      saveStats: (stats: RefreshStats) => {
        saved.push(stats);
        return Promise.resolve();
      },
      now: NOW,
    },
  };
};

const dailyTables = () => ({
  "BILL_TBL.dat": [
    billRow(
      "202520260AB1",
      "Amended Assembly",
      "Senate",
      "In Committee Process",
    ),
    billRow("202520260AB2", "Introduced", "Assembly", "Died"),
    billRow("202520260AB666", "Introduced", "Assembly", "Pending Referral"),
  ].join("\n"),
  "BILL_HISTORY_TBL.dat": [
    historyRow(
      "202520260AB1",
      1,
      "2026-01-12",
      "Read first time.",
      "Pending Referral",
    ),
    historyRow(
      "202520260AB1",
      2,
      "2026-05-26",
      "Read third time. Passed.",
      "Passed",
    ),
    historyRow(
      "202520260AB2",
      1,
      "2026-01-05",
      "Read first time.",
      "Pending Referral",
    ),
    historyRow(
      "202520260AB2",
      2,
      "2026-01-31",
      "Died pursuant to Art. IV.",
      "Died",
    ),
  ].join("\n"),
});

Deno.test("refresh writes changed bills once, and nothing on the next run", async () => {
  const files = {
    "pubinfo_daily_Mon.zip": {
      bytes: await archive(dailyTables()),
      lastModified: FRESH,
    },
  };
  const bills = [
    tracked(1, "202520260AB1"),
    tracked(2, "202520260AB2"),
    tracked(3, "202520260AB404"), // not in pubinfo yet
    tracked(4, null), // no leginfo link
    tracked(666, "202520260AB666"), // update fails
  ];
  const h = harness(bills);
  const stats = await refreshBillStatuses({
    ...h.deps,
    fetchImpl: server(files),
  });

  assertEquals(
    [
      stats.tracked,
      stats.without_pubinfo_id,
      stats.matched,
      stats.not_in_pubinfo,
    ],
    [5, 1, 3, 1],
  );
  assertEquals([stats.updated, stats.update_errors, stats.unchanged], [
    2,
    1,
    0,
  ]);
  assertEquals(stats.archives.map((a) => a.file), ["pubinfo_daily_Mon.zip"]);
  assertEquals(h.updates.get(1)!.status, "2");
  assertEquals(h.updates.get(1)!.status_date, "2026-05-26");
  assertEquals(h.updates.get(1)!.history!.length, 2);
  assertEquals(h.updates.get(2)!.status, "6");
  // No hearings in the archive: calendar is not part of the write.
  assertFalseKey(h.updates.get(1)!, "calendar");
  assertEquals(h.saved.length, 1);
  assert(stats.errors.some((e) => e.includes("bill 666: write failed")));

  h.updates.clear();
  const again = await refreshBillStatuses({
    ...h.deps,
    fetchImpl: server(files),
  });
  assertEquals([again.updated, again.unchanged], [0, 2]);
  assertEquals([...h.updates.keys()], []);
});

const assertFalseKey = (value: object, key: string) =>
  assert(!(key in value), `${key} should not be written`);

Deno.test("dry run reports changes and writes nothing", async () => {
  const files = {
    "pubinfo_daily_Mon.zip": {
      bytes: await archive(dailyTables()),
      lastModified: FRESH,
    },
  };
  const h = harness([tracked(1, "202520260AB1")]);
  const stats = await refreshBillStatuses(
    { ...h.deps, fetchImpl: server(files) },
    { dryRun: true },
  );
  assertEquals(stats.updated, 1);
  assertEquals(stats.samples!.length, 1);
  assertEquals(stats.samples![0].changes.status, "2");
  assertEquals(h.updates.size, 0);
  assertEquals(h.saved.length, 0);
});

Deno.test("falls back to the session archive when the daily is another session's", async () => {
  const files = {
    "pubinfo_daily_Mon.zip": {
      bytes: await archive({
        "BILL_TBL.dat": billRow(
          "202720280AB1",
          "Introduced",
          "Assembly",
          "Pending Referral",
        ),
        "BILL_HISTORY_TBL.dat": "",
      }),
      lastModified: FRESH,
    },
    "pubinfo_2025.zip": {
      bytes: await archive(dailyTables()),
      lastModified: "Mon, 09 Nov 2026 05:26:00 GMT",
    },
  };
  const h = harness([tracked(1, "202520260AB1")]);
  const stats = await refreshBillStatuses({
    ...h.deps,
    fetchImpl: server(files),
  });
  assertEquals(stats.archives.map((a) => a.file), ["pubinfo_2025.zip"]);
  assertEquals(stats.updated, 1);
});

Deno.test("a Cloudflare challenge stops the run and is recorded", async () => {
  const requests: string[] = [];
  const h = harness([tracked(1, "202520260AB1")]);
  const stats = await refreshBillStatuses({
    ...h.deps,
    fetchImpl: server({ "pubinfo_daily_Tue.zip": 403 }, requests),
  });
  assert(stats.blocked);
  assertEquals(stats.updated, 0);
  assertEquals(requests, ["HEAD pubinfo_daily_Tue.zip"]);
  assertEquals(h.saved.length, 1);
  assert(h.saved[0].blocked);
});

Deno.test("no archive reachable: nothing written, bills counted as not found", async () => {
  const h = harness([tracked(1, "202520260AB1")]);
  const stats = await refreshBillStatuses({ ...h.deps, fetchImpl: server({}) });
  assertEquals([stats.matched, stats.not_in_pubinfo, stats.updated], [0, 1, 0]);
  assert(stats.errors.length > 0);
  assertEquals(stats.blocked, false);
});

Deno.test("diffBillStatus never blanks stored data with an empty pubinfo list", () => {
  const stored: TrackedBill = {
    id: 1,
    state_link: null,
    status: "2",
    status_date: "2026-05-26",
    history: [{ date: "2026-01-12", action: "x" }],
    progress: [{ date: "2026-01-12", event: 1 }],
    calendar: [{ date: "2026-03-03", type: "Hearing" }],
  };
  assertEquals(
    diffBillStatus(stored, {
      status: "2",
      status_date: null,
      history: [],
      progress: [],
      calendar: [],
    }),
    null,
  );
  assertEquals(
    diffBillStatus(stored, {
      status: "4",
      status_date: "2026-09-30",
      history: [],
      progress: [],
      calendar: [],
    }),
    { status: "4", status_date: "2026-09-30" },
  );
});
