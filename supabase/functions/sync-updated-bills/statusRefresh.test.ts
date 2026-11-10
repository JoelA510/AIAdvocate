import {
  assert,
  assertFalse,
} from "https://deno.land/std@0.177.0/testing/asserts.ts";

import { isStatusRefreshHealthy } from "./statusRefresh.ts";

const NOW = Date.parse("2026-11-11T10:00:00Z");
const good = {
  finished_at: "2026-11-10T10:40:09Z",
  dry_run: false,
  blocked: false,
  tracked: 182,
  without_pubinfo_id: 0,
  matched: 181,
  not_in_pubinfo: 1,
  updated: 3,
  update_errors: 0,
};

Deno.test("a recent, complete refresh lets sync skip getBill", () => {
  assert(isStatusRefreshHealthy(good, NOW));
});

Deno.test("anything short of that keeps the getBill fallback", () => {
  const not = (patch: Record<string, unknown>) =>
    assertFalse(isStatusRefreshHealthy({ ...good, ...patch }, NOW));
  not({ finished_at: "2026-11-09T09:00:00Z" }); // older than 48 h
  not({ finished_at: null });
  not({ blocked: true });
  not({ update_errors: 1 }); // a write failed
  not({ matched: 100 }); // a session or a table went missing
  not({ matched: 0 });
  not({ tracked: undefined }); // unknown shape
  assertFalse(isStatusRefreshHealthy(null, NOW));
  assertFalse(isStatusRefreshHealthy("x", NOW));
});
