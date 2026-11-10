import {
  assert,
  assertEquals,
  assertFalse,
  assertRejects,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";
import JSZip from "npm:jszip";

import {
  billIdFromStateLink,
  camlBillToHtml,
  camlToText,
  dailyArchiveCandidates,
  deserializePubinfoIndex,
  isBotChallenge,
  loadPubinfoIndex,
  loadPubinfoIndexCached,
  loadSessionPubinfoIndexCached,
  parseBillVersionTable,
  pubinfoCacheKey,
  type PubinfoCacheStore,
  PubinfoFetchError,
  readBillText,
  serializePubinfoIndex,
} from "./pubinfo.ts";

// Row shape copied from the real 2025 BILL_VERSION_TBL.dat (2026-11-09).
const row = (
  billId: string,
  versionNum: number,
  date: string,
  lob: string,
) =>
  [
    `\`20250X${versionNum}\``,
    `\`${billId}\``,
    String(versionNum),
    `${date} 00:00:00`,
    "`Amended Assembly`",
    "NULL",
    "`Title`",
    "`Majority`",
    "`No`",
    "`Yes`",
    "`No`",
    "NULL",
    "`No`",
    "`No`",
    lob,
    "`Y`",
    "`LEG_ESI`",
    `${date} 10:00:00`,
  ].join("\t");

const caml = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><caml:MeasureDoc>` +
  `<!-- Copyright -->${body}</caml:MeasureDoc>`;

const buildArchive = async (): Promise<Uint8Array> => {
  const zip = new JSZip();
  zip.file(
    "BILL_VERSION_TBL.dat",
    [
      row("202520260AB1568", 99, "2026-01-12", "BILL_VERSION_TBL_1.lob"),
      row("202520260AB1568", 96, "2026-05-18", "BILL_VERSION_TBL_3.lob"),
      row("202520260AB1568", 98, "2026-02-23", "BILL_VERSION_TBL_2.lob"),
      row("202520260AB2749", 99, "2026-02-20", "BILL_VERSION_TBL_4.lob"),
    ].join("\n"),
  );
  zip.file("BILL_VERSION_TBL_1.lob", caml("<p>introduced text</p>"));
  zip.file("BILL_VERSION_TBL_2.lob", caml("<p>first amendment</p>"));
  zip.file(
    "BILL_VERSION_TBL_3.lob",
    caml("<p>A registered <span>sex offender</span> &amp; more.</p>"),
  );
  zip.file("BILL_VERSION_TBL_4.lob", caml("<p>loitering &lt;text&gt;</p>"));
  zip.file("LAW_SECTION_TBL_1.lob", caml("<p>not a bill</p>"));
  return await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
};

// Serves `bytes` with HEAD and single-range GET, like the real host.
const rangeServer =
  (getBytes: () => Uint8Array, requests: string[] = []) =>
  (_url: string, init?: RequestInit): Promise<Response> => {
    const bytes = getBytes();
    if (init?.method === "HEAD") {
      requests.push("HEAD");
      return Promise.resolve(
        new Response(null, {
          status: 200,
          headers: { "content-length": String(bytes.length) },
        }),
      );
    }
    const range = new Headers(init?.headers).get("Range") ?? "";
    requests.push(range);
    const match = /^bytes=(\d+)-(\d+)$/.exec(range);
    if (!match) {
      return Promise.resolve(
        new Response(new Uint8Array(bytes), { status: 200 }),
      );
    }
    const start = Number(match[1]);
    const end = Math.min(Number(match[2]), bytes.length - 1);
    return Promise.resolve(
      new Response(bytes.slice(start, end + 1), { status: 206 }),
    );
  };

Deno.test("reads the latest version's text with range requests only", async () => {
  const archive = await buildArchive();
  const requests: string[] = [];
  const fetchImpl = rangeServer(() => archive, requests);
  const index = await loadPubinfoIndex("https://example.test/p.zip", fetchImpl);

  assertEquals(
    index.latestLobByBill.get("202520260AB1568"),
    "BILL_VERSION_TBL_3.lob",
  );
  // Non-bill entries are not kept.
  assertEquals(index.entries.has("LAW_SECTION_TBL_1.lob"), false);

  const text = await readBillText(index, "202520260AB1568", fetchImpl);
  assertEquals(text, "A registered sex offender & more.");
  assertEquals(
    await readBillText(index, "202520260AB2749", fetchImpl),
    "loitering <text>",
  );
  // Not in the archive yet (rebuilt nightly): null, not an error.
  assertEquals(await readBillText(index, "202520260AB9999", fetchImpl), null);
  assert(requests.every((r) => r === "HEAD" || r.startsWith("bytes=")));
});

Deno.test("a rebuild between index and read fails instead of reading the wrong bill", async () => {
  const original = await buildArchive();
  let current = original;
  const fetchImpl = rangeServer(() => current);
  const index = await loadPubinfoIndex("https://example.test/p.zip", fetchImpl);

  // Same entries, different order: every offset moves.
  const rebuilt = new JSZip();
  rebuilt.file("PADDING.dat", "x".repeat(5000));
  const source = await JSZip.loadAsync(original);
  for (const name of Object.keys(source.files).reverse()) {
    rebuilt.file(name, await source.files[name].async("uint8array"));
  }
  current = await rebuilt.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });

  await assertRejects(
    () => readBillText(index, "202520260AB1568", fetchImpl),
    Error,
  );
});

Deno.test("a Cloudflare challenge is reported as challenged", async () => {
  const fetchImpl = (_url: string, init?: RequestInit) =>
    Promise.resolve(
      init?.method === "HEAD"
        ? new Response(null, {
          status: 403,
          headers: { "cf-mitigated": "challenge" },
        })
        : new Response("<title>Just a moment...</title>", { status: 403 }),
    );
  const error = await assertRejects(
    () => loadPubinfoIndex("https://example.test/p.zip", fetchImpl),
    PubinfoFetchError,
  );
  assert((error as PubinfoFetchError).challenged);
});

Deno.test("parseBillVersionTable breaks a same-day tie toward the lower version", () => {
  const table = parseBillVersionTable(
    [
      row("202520260SCR2", 99, "2024-12-02", "BILL_VERSION_TBL_1.lob"),
      row("202520260SCR2", 97, "2024-12-09", "BILL_VERSION_TBL_8.lob"),
      row("202520260SCR2", 98, "2024-12-09", "BILL_VERSION_TBL_7.lob"),
      "garbage line",
      row("202520260AB1", 99, "2025-01-01", "not-a-lob.txt"),
    ].join("\n"),
  );
  assertEquals(table.get("202520260SCR2"), "BILL_VERSION_TBL_8.lob");
  assertEquals(table.has("202520260AB1"), false);
});

Deno.test("camlToText and billIdFromStateLink", () => {
  assertEquals(
    camlToText("<a>x</a><!-- c --><b>y&nbsp;&quot;z&quot;</b>"),
    'x y "z"',
  );
  // Decoded once: an escaped entity stays literal text.
  assertEquals(camlToText("a &amp;lt; b &amp;amp; c"), "a &lt; b &amp; c");
  assertEquals(
    billIdFromStateLink(
      "https://leginfo.legislature.ca.gov/faces/billStatusClient.xhtml?bill_id=202520260AB1568",
    ),
    "202520260AB1568",
  );
  assertEquals(billIdFromStateLink("not a url"), null);
  assertEquals(billIdFromStateLink(null), null);
});

const CHALLENGE_PAGE =
  '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>' +
  '<meta http-equiv="content-security-policy" content="script-src https://challenges.cloudflare.com">';

Deno.test("detects the Cloudflare challenge leginfo served on 2026-10-27", () => {
  assert(isBotChallenge(403, null, CHALLENGE_PAGE));
  assert(isBotChallenge(403, "challenge", ""));
  assert(isBotChallenge(200, null, CHALLENGE_PAGE));
  // Untitled variant: the challenge-platform script alone is conclusive.
  assert(
    isBotChallenge(
      403,
      null,
      '<script>window._cf_chl_opt={};</script><script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script>',
    ),
  );
});

Deno.test("ordinary failures are not treated as a challenge", () => {
  assertFalse(
    isBotChallenge(403, null, "<html><title>Forbidden</title></html>"),
  );
  assertFalse(isBotChallenge(500, null, "Internal Server Error"));
  assertFalse(isBotChallenge(404, null, CHALLENGE_PAGE));
  assertFalse(isBotChallenge(200, null, '<div id="bill_all">text</div>'));
  // Loading a Cloudflare-hosted script is not a challenge.
  assertFalse(
    isBotChallenge(
      403,
      null,
      '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>',
    ),
  );
});

Deno.test("camlBillToHtml keeps title, digest and bill; drops metadata", () => {
  const xml = '<?xml version="1.0"?><caml:MeasureDoc>' +
    "<caml:Description><caml:Id>20250AB__156896AMD</caml:Id>" +
    "<caml:History><caml:Action><caml:ActionText>INTRODUCED</caml:ActionText>" +
    "</caml:Action></caml:History>" +
    "<caml:Title>Sex offenses: registration.</caml:Title>" +
    "<caml:DigestText><p>Existing law requires a sex offender to register.</p>" +
    "</caml:DigestText></caml:Description>" +
    '<caml:Bill id="bill"><caml:Preamble>The people enact:</caml:Preamble>' +
    "<caml:BillSection><caml:Num>SECTION 1.</caml:Num>" +
    "<caml:ActionLine>Section 290.5 of the <caml:Fragment>Penal Code" +
    "</caml:Fragment> is amended</caml:ActionLine></caml:BillSection>" +
    "</caml:Bill></caml:MeasureDoc>";
  const html = camlBillToHtml(xml)!;
  assert(html.includes("Sex offenses: registration."));
  assert(html.includes("LEGISLATIVE COUNSEL'S DIGEST"));
  assert(
    html.includes("<p>Existing law requires a sex offender to register.</p>"),
  );
  // Inline fragment stays mid-sentence; CAML blocks become divs.
  assert(html.includes("Section 290.5 of the Penal Code is amended"));
  assert(html.includes("<div>SECTION 1.</div>"));
  assertFalse(html.includes("caml:"));
  assertFalse(html.includes("INTRODUCED"));
  assertFalse(html.includes("20250AB__156896AMD"));
  assertEquals(camlBillToHtml("<caml:MeasureDoc></caml:MeasureDoc>"), null);
});

Deno.test("camlBillToHtml yields the bill as amended: struck text dropped", () => {
  // Marks as in AB2749's 2026 amendment.
  const xml = "<caml:Bill><p>intent to purchase commercial sex." +
    '<?xm-deletion_mark data=" This intent is evidenced by acting in a manner"?>' +
    "<?xm-insertion_mark_start?> It does not require a completed communication." +
    "<?xm-insertion_mark_end?></p></caml:Bill>";
  const html = camlBillToHtml(xml)!;
  assert(html.includes("It does not require a completed communication."));
  assertFalse(html.includes("This intent is evidenced"));
  assertFalse(html.includes("<?"));
});

Deno.test("the index cache round-trips and rejects stale or junk entries", async () => {
  const archive = await buildArchive();
  const index = await loadPubinfoIndex(
    "https://example.test/p.zip",
    rangeServer(() => archive),
  );
  const cached = serializePubinfoIndex(index);
  const restored = deserializePubinfoIndex(index.url, cached, index.version)!;
  assertEquals(restored.latestLobByBill, index.latestLobByBill);
  assertEquals(
    restored.entries.get("BILL_VERSION_TBL_3.lob"),
    index.entries.get("BILL_VERSION_TBL_3.lob"),
  );
  // A different archive version is a miss.
  assertEquals(deserializePubinfoIndex(index.url, cached, "other"), null);
  assertEquals(deserializePubinfoIndex(index.url, null, index.version), null);
  assertEquals(
    deserializePubinfoIndex(index.url, {
      version: index.version,
      bills: {
        X: ["../etc/passwd", 1, 1, 8],
        Y: ["BILL_VERSION_TBL_9.lob", "a", 1, 8],
      },
    }, index.version),
    null,
  );
});

const memoryStore = (fail = false) => {
  const data = new Map<string, unknown>();
  const store: PubinfoCacheStore = {
    get: (key) =>
      fail
        ? Promise.reject(new Error("db down"))
        : Promise.resolve(data.get(key)),
    set: (key, value) => {
      if (fail) return Promise.reject(new Error("db down"));
      data.set(key, value);
      return Promise.resolve();
    },
  };
  return { data, store };
};

Deno.test("cached load: the second worker pays one HEAD, not the 20 MB", async () => {
  const archive = await buildArchive();
  const url = "https://example.test/pubinfo_2025.zip";
  const { data, store } = memoryStore();

  const first: string[] = [];
  const a = await loadPubinfoIndexCached(
    store,
    url,
    rangeServer(() => archive, first),
  );
  assertEquals(a.fromCache, false);
  assert(first.length > 1);
  assert(data.has(pubinfoCacheKey(url)));

  const second: string[] = [];
  const b = await loadPubinfoIndexCached(
    store,
    url,
    rangeServer(() => archive, second),
  );
  assertEquals(b.fromCache, true);
  assertEquals(second, ["HEAD"]);
  // The cached index still reads real text.
  assertEquals(
    await readBillText(b.index, "202520260AB1568", rangeServer(() => archive)),
    "A registered sex offender & more.",
  );
});

Deno.test("cached load rebuilds when the archive changes and survives a broken store", async () => {
  const archive = await buildArchive();
  const url = "https://example.test/pubinfo_2025.zip";
  const { store } = memoryStore();
  await loadPubinfoIndexCached(store, url, rangeServer(() => archive));

  // Nightly rebuild: different size => different version => full build.
  const rebuilt = new JSZip();
  const source = await JSZip.loadAsync(archive);
  rebuilt.file("PAD.dat", "pad");
  for (const name of Object.keys(source.files)) {
    rebuilt.file(name, await source.files[name].async("uint8array"));
  }
  const next = await rebuilt.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
  assert(next.length !== archive.length);
  const c = await loadPubinfoIndexCached(store, url, rangeServer(() => next));
  assertEquals(c.fromCache, false);

  // A failing cache store never fails the load.
  const broken = memoryStore(true).store;
  const d = await loadPubinfoIndexCached(
    broken,
    url,
    rangeServer(() => archive),
  );
  assertEquals(d.fromCache, false);
  assertEquals(
    d.index.latestLobByBill.get("202520260AB2749"),
    "BILL_VERSION_TBL_4.lob",
  );
});

Deno.test("cold cache: five concurrent workers build the index once", async () => {
  const archive = await buildArchive();
  const url = "https://example.test/pubinfo_2025.zip";
  const data = new Map<string, unknown>();
  const locks = new Set<string>();
  const store: PubinfoCacheStore = {
    get: (key) => Promise.resolve(data.get(key)),
    set: (key, value) => {
      data.set(key, value);
      return Promise.resolve();
    },
    tryLock: (key) => {
      if (locks.has(key)) return Promise.resolve(false);
      locks.add(key);
      return Promise.resolve(true);
    },
    unlock: (key) => {
      locks.delete(key);
      return Promise.resolve();
    },
  };
  // Count central-directory-sized reads: only a build makes them.
  let builds = 0;
  const server = rangeServer(() => archive);
  const counting = async (u: string, init?: RequestInit) => {
    const range = new Headers(init?.headers).get("Range") ?? "";
    if (range.endsWith(`-${archive.length - 1}`)) builds += 1;
    // Slow the build down so the waiters really overlap it.
    if (range) await new Promise((r) => setTimeout(r, 5));
    return server(u, init);
  };

  const results = await Promise.all(
    Array.from(
      { length: 5 },
      () => loadPubinfoIndexCached(store, url, counting, { pollMs: 10 }),
    ),
  );
  assertEquals(builds, 1);
  assertEquals(results.filter((r) => !r.fromCache).length, 1);
  assertEquals(locks.size, 0);
  for (const r of results) {
    assertEquals(
      r.index.latestLobByBill.get("202520260AB1568"),
      "BILL_VERSION_TBL_3.lob",
    );
  }
});

Deno.test("a waiter that never sees the cache builds for itself", async () => {
  const archive = await buildArchive();
  const store: PubinfoCacheStore = {
    get: () => Promise.resolve(null),
    set: () => Promise.resolve(),
    tryLock: () => Promise.resolve(false), // someone else "owns" it forever
    unlock: () => Promise.resolve(),
  };
  const result = await loadPubinfoIndexCached(
    store,
    "https://example.test/pubinfo_2025.zip",
    rangeServer(() => archive),
    { waitForBuildMs: 30, pollMs: 10 },
  );
  assertEquals(result.fromCache, false);
  assertEquals(result.index.latestLobByBill.size, 2);
});

// --- archive selection -------------------------------------------------------

// One host with several archives; each has its own bytes and Last-Modified.
const multiServer = (
  files: Record<string, { bytes: Uint8Array; lastModified: string } | number>,
  requests: string[] = [],
) =>
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
  return rangeServer(() => file.bytes)(url, init);
};

const archiveWith = async (billId: string, text: string) => {
  const zip = new JSZip();
  zip.file(
    "BILL_VERSION_TBL.dat",
    row(billId, 99, "2026-11-09", "BILL_VERSION_TBL_1.lob"),
  );
  zip.file("BILL_VERSION_TBL_1.lob", caml(`<p>${text}</p>`));
  return await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
};

Deno.test("daily candidates follow the Capitol's weekday, not UTC's", () => {
  // 2026-11-10 03:00 UTC is still Monday evening in Sacramento.
  assertEquals(
    dailyArchiveCandidates(new Date("2026-11-10T03:00:00Z")).map((u) =>
      u.slice(u.lastIndexOf("/") + 1)
    ),
    ["pubinfo_daily_Mon.zip", "pubinfo_daily_Sun.zip"],
  );
  // Sunday wraps to Saturday.
  assertEquals(
    dailyArchiveCandidates(new Date("2026-11-08T20:00:00Z")).map((u) =>
      u.slice(u.lastIndexOf("/") + 1)
    ),
    ["pubinfo_daily_Sun.zip", "pubinfo_daily_Sat.zip"],
  );
});

Deno.test("session load prefers the fresher daily over today's week-old file", async () => {
  // Tuesday afternoon: pubinfo_daily_Tue.zip is still last week's build.
  const now = new Date("2026-11-10T22:00:00Z");
  const files = {
    "pubinfo_daily_Tue.zip": {
      bytes: await archiveWith("202520260AB1", "last week"),
      lastModified: "Wed, 04 Nov 2026 05:23:00 GMT",
    },
    "pubinfo_daily_Mon.zip": {
      bytes: await archiveWith("202520260AB1", "monday build"),
      lastModified: "Tue, 10 Nov 2026 05:23:00 GMT",
    },
    "pubinfo_2025.zip": {
      bytes: await archiveWith("202520260AB1", "sunday build"),
      lastModified: "Mon, 09 Nov 2026 05:26:00 GMT",
    },
  };
  const requests: string[] = [];
  const { data, store } = memoryStore();
  const { index } = await loadSessionPubinfoIndexCached(
    store,
    2025,
    multiServer(files, requests),
    { now },
  );
  assert(index.url.endsWith("pubinfo_daily_Mon.zip"));
  assertEquals(
    await readBillText(index, "202520260AB1", multiServer(files)),
    "monday build",
  );
  // One HEAD per candidate, none for the session archive, no second HEAD.
  assertEquals(requests.filter((r) => r.startsWith("HEAD")), [
    "HEAD pubinfo_daily_Tue.zip",
    "HEAD pubinfo_daily_Mon.zip",
  ]);
  // All dailies share one cache row.
  assertEquals([...data.keys()], ["pubinfo_index:pubinfo_daily.zip"]);
});

Deno.test("session load falls back when dailies are stale, missing or for another session", async () => {
  const now = new Date("2026-11-10T22:00:00Z");
  const session = {
    bytes: await archiveWith("202520260AB1", "session archive"),
    lastModified: "Mon, 09 Nov 2026 05:26:00 GMT",
  };
  const load = async (files: Parameters<typeof multiServer>[0]) => {
    const { index } = await loadSessionPubinfoIndexCached(
      memoryStore().store,
      2025,
      multiServer(files),
      { now },
    );
    return index.url.slice(index.url.lastIndexOf("/") + 1);
  };

  // Missing (404) and stale (older than 3 days).
  assertEquals(
    await load({
      "pubinfo_daily_Mon.zip": {
        bytes: await archiveWith("202520260AB1", "old"),
        lastModified: "Tue, 03 Nov 2026 05:23:00 GMT",
      },
      "pubinfo_2025.zip": session,
    }),
    "pubinfo_2025.zip",
  );
  // After a rollover the daily holds only the new session's bills.
  assertEquals(
    await load({
      "pubinfo_daily_Mon.zip": {
        bytes: await archiveWith("202720280AB1", "new session"),
        lastModified: "Tue, 10 Nov 2026 05:23:00 GMT",
      },
      "pubinfo_2025.zip": session,
    }),
    "pubinfo_2025.zip",
  );
  // A corrupt daily (not a zip) falls back too.
  assertEquals(
    await load({
      "pubinfo_daily_Mon.zip": {
        bytes: new Uint8Array(2048),
        lastModified: "Tue, 10 Nov 2026 05:23:00 GMT",
      },
      "pubinfo_2025.zip": session,
    }),
    "pubinfo_2025.zip",
  );
});

Deno.test("a challenge on a daily archive is not retried against the session archive", async () => {
  const requests: string[] = [];
  const error = await assertRejects(
    () =>
      loadSessionPubinfoIndexCached(
        memoryStore().store,
        2025,
        multiServer({ "pubinfo_daily_Tue.zip": 403 }, requests),
        { now: new Date("2026-11-10T22:00:00Z") },
      ),
    PubinfoFetchError,
  );
  assert(error.challenged);
  assertEquals(requests, ["HEAD pubinfo_daily_Tue.zip"]);
});
