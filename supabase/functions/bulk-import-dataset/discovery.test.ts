import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";

import {
  buildVerifyRegex,
  createCallPacer,
  isBotChallenge,
  matchPinnedFromMasterList,
  MAX_PINNED_BILLS,
  orderPhrasesByLastSearched,
  pacerCanCall,
  pacerRecordCall,
  pacerWaitMs,
  parsePinnedBillNumbers,
  phraseSetKey,
  RELEVANT_SEARCH_PHRASES,
  searchResourceKey,
} from "./discovery.ts";

Deno.test("verify gate admits the 2026 bills the old list could not reach", () => {
  const regex = buildVerifyRegex(RELEVANT_SEARCH_PHRASES);
  // Digest/operative-text fragments of AB2749, AB1568, AB1705.
  assert(
    regex.test(
      "loiter in a public place with the intent to purchase Commercial Sex",
    ),
  );
  assert(regex.test("petition for termination from the sex offender registry"));
  assert(regex.test("operator of a pornographic internet website"));
  assertFalse(regex.test("groundwater sustainability agency"));
});

Deno.test("verify gate escapes regex metacharacters in overridden phrases", () => {
  const regex = buildVerifyRegex(["a.b", "(c)"]);
  assert(regex.test("x a.b y"));
  assertFalse(regex.test("axb"));
  assert(regex.test("(c)"));
  assertFalse(regex.test("c"));
});

Deno.test("phraseSetKey ignores order, case, whitespace and duplicates", () => {
  assertEquals(
    phraseSetKey(["Sexual Assault", " prostitution", "prostitution "]),
    phraseSetKey(["prostitution", "sexual assault"]),
  );
});

Deno.test("phraseSetKey changes when a phrase is added", () => {
  const before = RELEVANT_SEARCH_PHRASES.filter((p) => p !== "commercial sex");
  assertFalse(phraseSetKey(before) === phraseSetKey(RELEVANT_SEARCH_PHRASES));
});

Deno.test("searchResourceKey keeps the reservation key format", () => {
  assertEquals(
    searchResourceKey("CA", 2172, "human trafficking", 2),
    "CA:2172:human trafficking:p2",
  );
});

Deno.test("never-searched phrases lead, in list order, then oldest first", () => {
  const order = orderPhrasesByLastSearched(
    ["a", "b", "c", "d", "e"],
    new Map([
      ["a", 300],
      ["b", 100],
      ["d", 200],
    ]),
  );
  assertEquals(order, ["c", "e", "b", "d", "a"]);
});

Deno.test("rotation reaches phrases a fixed-order sweep starved", () => {
  // Simulate daily runs with a 6-page budget, 2 pages per phrase, and a
  // cooldown shorter than the run interval (the production defaults).
  const phrases = RELEVANT_SEARCH_PHRASES;
  const last = new Map<string, number>();
  const searched = new Set<string>();
  const runs = Math.ceil(phrases.length / 3);
  for (let day = 1; day <= runs; day += 1) {
    const batch = orderPhrasesByLastSearched(phrases, last).slice(0, 3);
    for (const phrase of batch) {
      last.set(phrase, day);
      searched.add(phrase);
    }
  }
  assertEquals(searched.size, phrases.length);
  assert(searched.has("prostitution"));
});

Deno.test("does not mutate the input list", () => {
  const phrases = ["a", "b"];
  orderPhrasesByLastSearched(phrases, new Map([["a", 1]]));
  assertEquals(phrases, ["a", "b"]);
});

const CHALLENGE_PAGE =
  '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>' +
  '<meta http-equiv="content-security-policy" content="script-src https://challenges.cloudflare.com">';

Deno.test("detects the Cloudflare challenge leginfo served on 2026-10-27", () => {
  assert(isBotChallenge(403, null, CHALLENGE_PAGE));
  assert(isBotChallenge(403, "challenge", ""));
  assert(isBotChallenge(200, null, CHALLENGE_PAGE));
});

Deno.test("ordinary failures are not treated as a challenge", () => {
  assertFalse(
    isBotChallenge(403, null, "<html><title>Forbidden</title></html>"),
  );
  assertFalse(isBotChallenge(500, null, "Internal Server Error"));
  assertFalse(isBotChallenge(404, null, CHALLENGE_PAGE));
  assertFalse(isBotChallenge(200, null, '<div id="bill_all">text</div>'));
});

Deno.test("pacer enforces the gap from the previous call and the per-invocation cap", () => {
  const pacer = createCallPacer(2, 1000);
  assertEquals(pacerWaitMs(pacer, 5_000), 0);
  assert(pacerCanCall(pacer));
  pacerRecordCall(pacer, 5_000);
  assertEquals(pacerWaitMs(pacer, 5_400), 600);
  assertEquals(pacerWaitMs(pacer, 7_000), 0);
  pacerRecordCall(pacer, 7_000);
  assertFalse(pacerCanCall(pacer));
});

Deno.test("parsePinnedBillNumbers normalizes, dedupes and reports junk", () => {
  assertEquals(
    parsePinnedBillNumbers(" AB 1705 | ab1568,AB2749 |AB1705||DROP TABLE"),
    { valid: ["AB1705", "AB1568", "AB2749"], invalid: ["DROP TABLE"] },
  );
  assertEquals(parsePinnedBillNumbers(undefined), { valid: [], invalid: [] });
  assertEquals(parsePinnedBillNumbers("  "), { valid: [], invalid: [] });
});

Deno.test("parsePinnedBillNumbers caps the list", () => {
  const raw = Array.from(
    { length: MAX_PINNED_BILLS + 2 },
    (_, i) => `AB${i + 1}`,
  ).join("|");
  const { valid, invalid } = parsePinnedBillNumbers(raw);
  assertEquals(valid.length, MAX_PINNED_BILLS);
  assertEquals(invalid, [
    `AB${MAX_PINNED_BILLS + 1}`,
    `AB${MAX_PINNED_BILLS + 2}`,
  ]);
});

// Shape of a getMasterList response's `masterlist` object (LegiScan API
// manual): numeric-string keys plus a non-bill `session` entry.
const MASTERLIST = {
  session: { session_id: 2172, session_name: "2025-2026 Regular Session" },
  "0": {
    bill_id: 2000001,
    number: "AB1705",
    change_hash: "abc",
    title: "Pornographic internet websites.",
    description: "An act to add ...",
  },
  "1": { bill_id: 2000002, number: "AB17050", title: "Not this one." },
  "2": { bill_id: "2000003", number: "AB2749", title: "Crimes: loitering." },
  "3": { bill_id: 0, number: "AB1568", title: "Bad id" },
  "4": { bill_id: 2000004, number: "SB1705", title: "Wrong house." },
};

Deno.test("matchPinnedFromMasterList returns exact matches in requested order", () => {
  assertEquals(
    matchPinnedFromMasterList(MASTERLIST, ["AB2749", "AB1705", "AB1568"]),
    [
      {
        bill_id: 2000003,
        number: "AB2749",
        title: "Crimes: loitering.",
        description: null,
        change_hash: null,
      },
      {
        bill_id: 2000001,
        number: "AB1705",
        title: "Pornographic internet websites.",
        description: "An act to add ...",
        change_hash: "abc",
      },
    ],
  );
});

Deno.test("matchPinnedFromMasterList tolerates malformed responses", () => {
  assertEquals(matchPinnedFromMasterList(null, ["AB1705"]), []);
  assertEquals(matchPinnedFromMasterList("ERROR", ["AB1705"]), []);
  assertEquals(matchPinnedFromMasterList({ "0": null }, ["AB1705"]), []);
});
