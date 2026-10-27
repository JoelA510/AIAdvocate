import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";

import {
  buildVerifyRegex,
  isBotChallenge,
  orderPhrasesByLastSearched,
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
