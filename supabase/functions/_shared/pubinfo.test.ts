import {
  assert,
  assertEquals,
  assertFalse,
  assertRejects,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";
import JSZip from "npm:jszip";

import {
  billIdFromStateLink,
  camlToText,
  isBotChallenge,
  loadPubinfoIndex,
  parseBillVersionTable,
  PubinfoFetchError,
  readBillText,
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
