jest.mock("../supabase", () => ({
  supabase: { rpc: jest.fn() },
}));

import { supabase } from "../supabase";
import {
  QUIET_AFTER_MS,
  STALE_AFTER_MS,
  describeFreshness,
  fetchDataFreshness,
  parseDataFreshness,
} from "../dataFreshness";

const rpc = supabase.rpc as jest.Mock;

// Local noon, so the formatted day is the same in any time zone the suite
// runs in.
const CHECKED = new Date(2026, 10, 11, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("parseDataFreshness", () => {
  it("keeps well-formed values", () => {
    expect(
      parseDataFreshness({
        last_checked_at: "2026-11-11T21:03:35+00:00",
        latest_action_date: "2026-09-30",
      }),
    ).toEqual({ lastCheckedAt: "2026-11-11T21:03:35+00:00", latestActionDate: "2026-09-30" });
  });

  it("drops malformed fields instead of passing them on", () => {
    expect(parseDataFreshness({ last_checked_at: "soon", latest_action_date: 20260930 })).toEqual({
      lastCheckedAt: null,
      latestActionDate: null,
    });
    expect(parseDataFreshness({})).toEqual({ lastCheckedAt: null, latestActionDate: null });
  });

  it("rejects a payload that is not an object", () => {
    expect(parseDataFreshness(null)).toBeNull();
    expect(parseDataFreshness("2026-11-11")).toBeNull();
    expect(parseDataFreshness([])).toBeNull();
  });
});

describe("describeFreshness", () => {
  const checked = { lastCheckedAt: CHECKED.toISOString(), latestActionDate: null };

  it("is fresh just inside the allowance and stale at it", () => {
    expect(describeFreshness(checked, CHECKED.getTime() + STALE_AFTER_MS - 1)).toEqual({
      state: "fresh",
      checkedDate: "11/11/2026",
      quietSince: null,
    });
    expect(describeFreshness(checked, CHECKED.getTime() + STALE_AFTER_MS)).toEqual({
      state: "stale",
      checkedDate: "11/11/2026",
      quietSince: null,
    });
  });

  it("is stale with no date when a check was never recorded", () => {
    expect(
      describeFreshness({ lastCheckedAt: null, latestActionDate: "2026-09-30" }, CHECKED.getTime()),
    ).toEqual({ state: "stale", checkedDate: null, quietSince: null });
  });

  it("reports a quiet period only once the latest action is old enough", () => {
    const actionMs = Date.UTC(2026, 8, 30);
    const at = (nowMs: number) =>
      describeFreshness(
        { lastCheckedAt: new Date(nowMs - HOUR).toISOString(), latestActionDate: "2026-09-30" },
        nowMs,
      ).quietSince;
    expect(at(actionMs + QUIET_AFTER_MS - 1)).toBeNull();
    expect(at(actionMs + QUIET_AFTER_MS)).toBe("09/30/2026");
  });

  it("does not call the Legislature quiet when our own check is stale", () => {
    const view = describeFreshness(
      { lastCheckedAt: CHECKED.toISOString(), latestActionDate: "2026-09-30" },
      CHECKED.getTime() + 5 * DAY,
    );
    expect(view.state).toBe("stale");
    expect(view.quietSince).toBeNull();
  });
});

describe("fetchDataFreshness", () => {
  beforeEach(() => rpc.mockReset());

  it("calls the RPC and returns the parsed row", async () => {
    rpc.mockResolvedValue({
      data: { last_checked_at: "2026-11-11T21:03:35+00:00", latest_action_date: "2026-09-30" },
      error: null,
    });
    await expect(fetchDataFreshness()).resolves.toEqual({
      lastCheckedAt: "2026-11-11T21:03:35+00:00",
      latestActionDate: "2026-09-30",
    });
    expect(rpc).toHaveBeenCalledWith("get_data_freshness");
  });

  it("surfaces an RPC error and an unexpected shape", async () => {
    rpc.mockResolvedValue({ data: null, error: new Error("permission denied") });
    await expect(fetchDataFreshness()).rejects.toThrow("permission denied");
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(fetchDataFreshness()).rejects.toThrow("unexpected shape");
  });
});
