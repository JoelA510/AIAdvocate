// California Legislature bulk data ("pubinfo") as a bill-text source.
//
// leginfo.legislature.ca.gov serves a Cloudflare challenge to cloud egress
// (403 "Just a moment" to Supabase since at least 2026-10-27), so its bill pages
// cannot be scraped. downloads.leginfo.legislature.ca.gov is not challenged
// (206 to Supabase on 2026-11-09) and publishes the whole session nightly as
// pubinfo_<year>.zip (~1.2 GB). The archive supports HTTP range requests, so a
// single bill's text is reachable without downloading it:
//
//   1. tail of the file          -> end-of-central-directory (zip64 aware)
//   2. central directory (~20 MB) -> offset of every entry
//   3. BILL_VERSION_TBL.dat      -> bill id -> its versions' .lob entry names
//   4. one BILL_VERSION_TBL_<n>.lob -> that version's CAML XML
//
// Steps 1-3 run once per invocation (loadPubinfoIndex); step 4 is one small
// range request per bill (readBillText). Free source, no API quota: see
// docs/external-api-policy.md §5. Requests are sequential; callers space them.

export const PUBINFO_BASE_URL = "https://downloads.leginfo.legislature.ca.gov";

export const pubinfoUrlForSession = (yearStart: number): string =>
  `${PUBINFO_BASE_URL}/pubinfo_${yearStart}.zip`;

const USER_AGENT = "AIAdvocate/1.0 (bill text verification)";
const TAIL_BYTES = 65_536;
// The 2025 central directory is ~19.6 MB. Refuse anything wildly larger rather
// than allocate it inside an Edge Function.
const MAX_CENTRAL_DIRECTORY_BYTES = 64 * 1024 * 1024;
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const BILL_VERSION_INDEX = "BILL_VERSION_TBL.dat";
const BILL_VERSION_LOB = /^BILL_VERSION_TBL_\d+\.lob$/;

export type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  offset: number;
};

export type PubinfoIndex = {
  url: string;
  // content-length + Last-Modified of the archive the index was built from.
  version: string;
  // bill id as in leginfo URLs, e.g. "202520260AB1568" -> latest version's lob
  latestLobByBill: Map<string, string>;
  entries: Map<string, ZipEntry>;
};

// Thrown when the archive answers with something other than the requested
// range. `challenged` marks a Cloudflare challenge, which repeats for every
// further request from the same egress.
export class PubinfoFetchError extends Error {
  constructor(message: string, readonly challenged = false) {
    super(message);
    this.name = "PubinfoFetchError";
  }
}

// --- pure parsers -----------------------------------------------------------

const u16 = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32 = (b: Uint8Array, at: number) =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
const u64 = (b: Uint8Array, at: number) => {
  const value = u32(b, at) + u32(b, at + 4) * 2 ** 32;
  if (!Number.isSafeInteger(value)) throw new Error("zip64 value too large");
  return value;
};

const lastIndexOfSignature = (b: Uint8Array, sig: number[]): number => {
  for (let i = b.length - sig.length; i >= 0; i -= 1) {
    if (sig.every((byte, k) => b[i + k] === byte)) return i;
  }
  return -1;
};

/** Locate the central directory from the last bytes of the archive. */
export const parseEndOfCentralDirectory = (
  tail: Uint8Array,
): { offset: number; size: number } => {
  const eocd = lastIndexOfSignature(tail, [0x50, 0x4b, 0x05, 0x06]);
  if (eocd < 0) throw new Error("zip end-of-central-directory not found");
  let size = u32(tail, eocd + 12);
  let offset = u32(tail, eocd + 16);
  if (size === 0xffffffff || offset === 0xffffffff) {
    const z64 = lastIndexOfSignature(tail, [0x50, 0x4b, 0x06, 0x06]);
    if (z64 < 0) throw new Error("zip64 end-of-central-directory not found");
    size = u64(tail, z64 + 40);
    offset = u64(tail, z64 + 48);
  }
  return { offset, size };
};

/**
 * Parse central-directory records, keeping only entries `keep` accepts (the
 * full 2025 directory has ~205k entries; verification needs ~19k).
 */
export const parseCentralDirectory = (
  cd: Uint8Array,
  keep: (name: string) => boolean,
): Map<string, ZipEntry> => {
  const entries = new Map<string, ZipEntry>();
  const decoder = new TextDecoder("latin1");
  let p = 0;
  while (p + 46 <= cd.length && u32(cd, p) === 0x02014b50) {
    const method = u16(cd, p + 10);
    let compressedSize = u32(cd, p + 20);
    const uncompressedSize = u32(cd, p + 24);
    const nameLength = u16(cd, p + 28);
    const extraLength = u16(cd, p + 30);
    const commentLength = u16(cd, p + 32);
    let offset = u32(cd, p + 42);
    const name = decoder.decode(cd.subarray(p + 46, p + 46 + nameLength));

    if (keep(name)) {
      if (
        compressedSize === 0xffffffff || offset === 0xffffffff ||
        uncompressedSize === 0xffffffff
      ) {
        // zip64 extended information: present fields appear in this order.
        let q = p + 46 + nameLength;
        const end = q + extraLength;
        while (q + 4 <= end) {
          const id = u16(cd, q);
          const length = u16(cd, q + 2);
          if (id === 0x0001) {
            let r = q + 4;
            if (uncompressedSize === 0xffffffff) r += 8;
            if (compressedSize === 0xffffffff) {
              compressedSize = u64(cd, r);
              r += 8;
            }
            if (offset === 0xffffffff) offset = u64(cd, r);
            break;
          }
          q += 4 + length;
        }
      }
      entries.set(name, { name, method, compressedSize, offset });
    }
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
};

const unquote = (value: string): string =>
  value.startsWith("`") && value.endsWith("`") ? value.slice(1, -1) : value;

/**
 * BILL_VERSION_TBL.dat: tab-separated, backtick-quoted. Columns used:
 * 2 bill_id, 3 version_num, 4 version date, 15 lob file name. The latest
 * version is the newest date; version numbers count down (99 = introduced),
 * so a same-day tie goes to the lower number.
 */
export const parseBillVersionTable = (text: string): Map<string, string> => {
  const latest = new Map<
    string,
    { date: string; versionNum: number; lob: string }
  >();
  for (const line of text.split("\n")) {
    const cols = line.split("\t");
    if (cols.length < 15) continue;
    const billId = unquote(cols[1]);
    const versionNum = Number(cols[2]);
    const date = cols[3];
    const lob = cols[14].trim();
    if (!billId || !BILL_VERSION_LOB.test(lob)) continue;
    const current = latest.get(billId);
    if (
      !current || date > current.date ||
      (date === current.date && versionNum < current.versionNum)
    ) {
      latest.set(billId, { date, versionNum, lob });
    }
  }
  return new Map(Array.from(latest, ([id, v]) => [id, v.lob]));
};

/** CAML bill XML to plain text: tags and entities dropped, whitespace folded. */
export const camlToText = (xml: string): string =>
  xml
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    // Last, so "&amp;lt;" decodes to the text "&lt;", not to "<".
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** "...?bill_id=202520260AB1568" -> "202520260AB1568", else null. */
export const billIdFromStateLink = (
  stateLink: string | null,
): string | null => {
  if (!stateLink) return null;
  try {
    return new URL(stateLink).searchParams.get("bill_id");
  } catch {
    return null;
  }
};

/**
 * True when a legislature host answered with a Cloudflare bot challenge
 * instead of the content (leginfo has since 2026-10-27; downloads.leginfo is
 * behind the same CDN). Distinct from a transient failure: retrying from the same egress keeps
 * hitting the challenge, so the caller stops fetching for the rest of the run
 * and reports it rather than burning the verification budget.
 */
export const isBotChallenge = (
  status: number,
  cfMitigated: string | null,
  body: string,
): boolean => {
  if (cfMitigated?.toLowerCase() === "challenge") return true;
  if (status !== 403 && status !== 429 && status !== 503 && status !== 200) {
    return false;
  }
  // Markers of the interstitial itself, as served by leginfo on 2026-10-27.
  // A hostname substring would be weaker: ordinary pages can load scripts from
  // Cloudflare's challenge host.
  return /<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(body) ||
    /\/cdn-cgi\/challenge-platform\/|\b_cf_chl_opt\b/.test(body);
};

// --- I/O --------------------------------------------------------------------

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

// Per request. The largest read is the ~20 MB central directory.
const PUBINFO_REQUEST_TIMEOUT_MS = 45_000;

const fetchRange = async (
  fetchImpl: FetchLike,
  url: string,
  start: number,
  end: number,
): Promise<Uint8Array> => {
  const response = await fetchImpl(url, {
    headers: { Range: `bytes=${start}-${end}`, "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(PUBINFO_REQUEST_TIMEOUT_MS),
  });
  if (response.status !== 206) {
    const body = await response.text().catch(() => "");
    const challenged = isBotChallenge(
      response.status,
      response.headers.get("cf-mitigated"),
      body,
    );
    throw new PubinfoFetchError(
      `pubinfo range ${start}-${end} returned ${response.status}`,
      challenged,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
};

const inflateRaw = async (data: Uint8Array): Promise<Uint8Array> => {
  const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
};

const readEntryBytes = async (
  fetchImpl: FetchLike,
  url: string,
  entry: ZipEntry,
): Promise<Uint8Array> => {
  if (entry.compressedSize > MAX_ENTRY_BYTES) {
    throw new Error(`pubinfo entry too large (${entry.compressedSize} bytes)`);
  }
  // The local header's name/extra lengths can differ from the central
  // directory's, so read them before the data. The name is checked too: the
  // archive is rebuilt nightly, and an index loaded before a rebuild would
  // otherwise read some other bill's text at the old offset.
  const nameLength = new TextEncoder().encode(entry.name).length;
  const header = await fetchRange(
    fetchImpl,
    url,
    entry.offset,
    entry.offset + 29 + nameLength,
  );
  if (u32(header, 0) !== 0x04034b50) throw new Error("bad zip local header");
  const localName = new TextDecoder("latin1").decode(
    header.subarray(30, 30 + u16(header, 26)),
  );
  if (localName !== entry.name) {
    throw new Error(
      `pubinfo entry moved (expected ${entry.name}, found ${localName}); archive rebuilt mid-run`,
    );
  }
  const dataStart = entry.offset + 30 + u16(header, 26) + u16(header, 28);
  if (entry.compressedSize === 0) return new Uint8Array();
  const data = await fetchRange(
    fetchImpl,
    url,
    dataStart,
    dataStart + entry.compressedSize - 1,
  );
  if (entry.method === 0) return data;
  if (entry.method === 8) return await inflateRaw(data);
  throw new Error(`unsupported zip method ${entry.method}`);
};

/** The archive's size and version, from one HEAD request. */
export const headPubinfoArchive = async (
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ length: number; version: string }> => {
  const head = await fetchImpl(url, {
    method: "HEAD",
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(PUBINFO_REQUEST_TIMEOUT_MS),
  });
  const length = Number(head.headers.get("content-length"));
  if (!head.ok || !Number.isSafeInteger(length) || length <= 0) {
    const challenged = isBotChallenge(
      head.status,
      head.headers.get("cf-mitigated"),
      "",
    );
    throw new PubinfoFetchError(
      `pubinfo HEAD returned ${head.status}`,
      challenged,
    );
  }
  return {
    length,
    version: `${length}:${head.headers.get("last-modified") ?? ""}`,
  };
};

const buildPubinfoIndex = async (
  url: string,
  archive: { length: number; version: string },
  fetchImpl: FetchLike,
): Promise<PubinfoIndex> => {
  const { length } = archive;
  const tailStart = Math.max(0, length - TAIL_BYTES);
  const tail = await fetchRange(fetchImpl, url, tailStart, length - 1);
  const cd = parseEndOfCentralDirectory(tail);
  if (cd.size <= 0 || cd.size > MAX_CENTRAL_DIRECTORY_BYTES) {
    throw new Error(`pubinfo central directory size ${cd.size} out of range`);
  }

  const cdBytes = await fetchRange(
    fetchImpl,
    url,
    cd.offset,
    cd.offset + cd.size - 1,
  );
  const entries = parseCentralDirectory(
    cdBytes,
    (name) => name === BILL_VERSION_INDEX || BILL_VERSION_LOB.test(name),
  );
  const indexEntry = entries.get(BILL_VERSION_INDEX);
  if (!indexEntry) {
    throw new Error(`${BILL_VERSION_INDEX} missing from pubinfo`);
  }

  const tableText = new TextDecoder().decode(
    await readEntryBytes(fetchImpl, url, indexEntry),
  );
  return {
    url,
    version: archive.version,
    latestLobByBill: parseBillVersionTable(tableText),
    entries,
  };
};

/** Steps 1-3: a HEAD plus three range requests, ~21 MB for 2025-26. */
export const loadPubinfoIndex = async (
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<PubinfoIndex> =>
  buildPubinfoIndex(url, await headPubinfoArchive(url, fetchImpl), fetchImpl);

// --- shared index cache ------------------------------------------------------
//
// The daily refresh starts several sync-updated-bills workers at once, plus
// bulk-import-dataset. Each building its own index would pull ~20 MB from the
// Legislature's server per worker per run. Only the latest version of each
// bill is needed (~5k bills, ~300 KB as JSON), so the first worker after the
// nightly rebuild stores that slice, keyed by the archive's size and
// Last-Modified, and everyone else pays one HEAD request. A stale cache is
// still safe to read: readEntryBytes checks each entry's local header name.

type CachedIndex = {
  version: string;
  // bill id -> [lob name, offset, compressed size, method]
  bills: Record<string, [string, number, number, number]>;
};

export const serializePubinfoIndex = (index: PubinfoIndex): CachedIndex => {
  const bills: CachedIndex["bills"] = {};
  for (const [billId, lob] of index.latestLobByBill) {
    const entry = index.entries.get(lob);
    if (!entry) continue;
    bills[billId] = [lob, entry.offset, entry.compressedSize, entry.method];
  }
  return { version: index.version, bills };
};

export const deserializePubinfoIndex = (
  url: string,
  cached: unknown,
  version: string,
): PubinfoIndex | null => {
  const value = cached as Partial<CachedIndex> | null;
  if (!value || value.version !== version || typeof value.bills !== "object") {
    return null;
  }
  const latestLobByBill = new Map<string, string>();
  const entries = new Map<string, ZipEntry>();
  for (const [billId, row] of Object.entries(value.bills ?? {})) {
    if (!Array.isArray(row) || row.length !== 4) continue;
    const [name, offset, compressedSize, method] = row;
    if (
      typeof name !== "string" || !BILL_VERSION_LOB.test(name) ||
      ![offset, compressedSize, method].every(Number.isSafeInteger)
    ) {
      continue;
    }
    latestLobByBill.set(billId, name);
    entries.set(name, { name, offset, compressedSize, method });
  }
  return latestLobByBill.size > 0
    ? { url, version, latestLobByBill, entries }
    : null;
};

export type PubinfoCacheStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
};

/** ingestion_cursors-backed cache store for the service-role client. */
export const ingestionCursorStore = (
  // deno-lint-ignore no-explicit-any
  supabaseAdmin: any,
): PubinfoCacheStore => ({
  async get(key) {
    const { data, error } = await supabaseAdmin
      .from("ingestion_cursors")
      .select("cursor")
      .eq("key", key)
      .maybeSingle();
    if (error) throw new Error(error.message ?? String(error));
    return data?.cursor ?? null;
  },
  async set(key, value) {
    const nowIso = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("ingestion_cursors")
      .upsert({ key, cursor: value, updated_at: nowIso }, {
        onConflict: "key",
      });
    if (error) throw new Error(error.message ?? String(error));
  },
});

export const pubinfoCacheKey = (url: string): string =>
  `pubinfo_index:${url.slice(url.lastIndexOf("/") + 1)}`;

/**
 * The index for `url`, from the shared cache when it matches the archive's
 * current version, otherwise built from the archive and written back. Cache
 * read/write failures fall back to a fresh build; they never fail the call.
 */
export const loadPubinfoIndexCached = async (
  store: PubinfoCacheStore,
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ index: PubinfoIndex; fromCache: boolean }> => {
  const archive = await headPubinfoArchive(url, fetchImpl);
  const key = pubinfoCacheKey(url);
  try {
    const cached = deserializePubinfoIndex(
      url,
      await store.get(key),
      archive.version,
    );
    if (cached) return { index: cached, fromCache: true };
  } catch (error) {
    console.warn("pubinfo index cache read failed", { error: String(error) });
  }

  const index = await buildPubinfoIndex(url, archive, fetchImpl);
  try {
    await store.set(key, serializePubinfoIndex(index));
  } catch (error) {
    console.warn("pubinfo index cache write failed", { error: String(error) });
  }
  return { index, fromCache: false };
};

/**
 * Step 4: plain text of the bill's latest version, or null when the archive
 * has no version for it yet (it is rebuilt nightly).
 */
export const readBillText = async (
  index: PubinfoIndex,
  billId: string,
  fetchImpl: FetchLike = fetch,
): Promise<string | null> => {
  const xml = await readBillXml(index, billId, fetchImpl);
  return xml === null ? null : camlToText(xml);
};

/** The latest version's CAML XML, or null when the archive has none yet. */
export const readBillXml = async (
  index: PubinfoIndex,
  billId: string,
  fetchImpl: FetchLike = fetch,
): Promise<string | null> => {
  const lob = index.latestLobByBill.get(billId);
  if (!lob) return null;
  const entry = index.entries.get(lob);
  if (!entry) return null;
  return new TextDecoder().decode(
    await readEntryBytes(fetchImpl, index.url, entry),
  );
};

const firstElement = (xml: string, tag: string): string | null => {
  const match = new RegExp(
    `<caml:${tag}\\b[^>]*>([\\s\\S]*?)</caml:${tag}>`,
  ).exec(xml);
  return match ? match[1] : null;
};

/**
 * The readable part of a CAML bill -- title, Legislative Counsel's digest and
 * the bill itself, the same content leginfo's bill page shows -- as HTML with
 * CAML structure mapped to block elements, for an HTML-to-text pass. The
 * Description block (ids, version history) is left out. Null when the document
 * has no bill body.
 */
export const camlBillToHtml = (xml: string): string | null => {
  const bill = firstElement(xml, "Bill");
  if (bill === null) return null;
  const title = firstElement(xml, "Title");
  const digest = firstElement(xml, "DigestText");
  const parts = [
    title === null ? "" : `<div>${title}</div>`,
    digest === null
      ? ""
      : `<div>LEGISLATIVE COUNSEL'S DIGEST</div><div>${digest}</div>`,
    `<div>${bill}</div>`,
  ];
  return parts.join("")
    // Amendment marks are processing instructions. A deletion carries the
    // struck text in its data attribute (<?xm-deletion_mark data="..."?>) and
    // an insertion brackets the new text, so dropping every PI yields the
    // bill as amended -- without the struck passages that leginfo's page and
    // LegiScan's HTML both keep as plain text. PI content cannot contain "?>".
    .replace(/<\?[\s\S]*?\?>/g, "")
    // Fragment is inline (a code name inside an action line); every other CAML
    // element in a bill body is a block: sections, section numbers, action
    // lines, law sections, content.
    .replace(/<\/?caml:Fragment\b[^>]*>/g, "")
    .replace(/<(\/?)caml:[A-Za-z]+\b[^>]*>/g, "<$1div>");
};
