import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";

import {
  buildLocationIqSearchUrl,
  normalizeQuery,
  representativesFromCache,
  shouldServeCachedResults,
  shouldWriteCacheResults,
} from "./lookup.ts";

Deno.test("normalizeQuery canonicalizes ZIP searches to five digits", () => {
  assertEquals(normalizeQuery(" 94542 "), {
    cacheable: true,
    cacheType: "zip",
    lookupKey: "zip:94542",
    sanitized: "94542",
  });

  assertEquals(normalizeQuery("94542-1234"), {
    cacheable: true,
    cacheType: "zip",
    lookupKey: "zip:94542",
    sanitized: "94542",
  });
});

Deno.test("buildLocationIqSearchUrl uses postal-code parameters for ZIP searches", () => {
  const url = new URL(
    buildLocationIqSearchUrl("94542", "placeholder-token", "zip"),
  );

  assertEquals(url.searchParams.get("postalcode"), "94542");
  assertEquals(url.searchParams.get("countrycodes"), "us");
  assertEquals(url.searchParams.get("q"), null);
});

Deno.test("buildLocationIqSearchUrl uses free-form q for address searches", () => {
  const url = new URL(
    buildLocationIqSearchUrl(
      "25836 Hayward Blvd, Hayward, CA",
      "placeholder-token",
      null,
    ),
  );

  assertEquals(url.searchParams.get("q"), "25836 Hayward Blvd, Hayward, CA");
  assertEquals(url.searchParams.get("postalcode"), null);
});

Deno.test("empty ZIP cache rows are not served or extended", () => {
  assertFalse(shouldServeCachedResults("zip", []));
  assertFalse(shouldWriteCacheResults("zip", []));

  const cachedReps = [{ id: "ocd-person/example" }];
  assert(shouldServeCachedResults("zip", cachedReps));
  assert(shouldWriteCacheResults("zip", cachedReps));
});

Deno.test("non-ZIP cache rows may still cache empty arrays", () => {
  assert(shouldServeCachedResults("city", []));
  assert(shouldWriteCacheResults("city", []));
});

Deno.test("representativesFromCache only returns arrays", () => {
  const reps = [{ id: "ocd-person/example" }];

  assertEquals(representativesFromCache(reps), reps);
  assertEquals(representativesFromCache(null), []);
  assertEquals(representativesFromCache({ id: "not-an-array" }), []);
});
