// mobile-app/src/lib/dataFreshness.ts
//
// What the feed and the bill page say about how current the data is. A card's
// "Last action" date is when the Legislature last did something to the bill;
// it says nothing about when we last looked. public.get_data_freshness()
// supplies the second date, and this module turns the pair into the lines the
// UI shows.

import { supabase } from "@/lib/supabase";

export type DataFreshness = {
  // ISO timestamp of the last complete check against the Legislature's
  // records; null when the server does not know of one.
  lastCheckedAt: string | null;
  // YYYY-MM-DD of the latest action on any tracked bill.
  latestActionDate: string | null;
};

// The check runs daily. Two missed runs and the data is called out as
// possibly stale, the same allowance the server gives itself
// (STATUS_REFRESH_MAX_AGE_MS in sync-updated-bills).
export const STALE_AFTER_MS = 48 * 60 * 60 * 1000;
// With no action on any tracked bill for this long, say so: otherwise a quiet
// Legislature looks like a broken feed.
export const QUIET_AFTER_MS = 21 * 24 * 60 * 60 * 1000;

export type FreshnessView = {
  state: "fresh" | "stale";
  // MM/DD/YYYY in the viewer's time zone; null when never checked.
  checkedDate: string | null;
  // MM/DD/YYYY of the latest action, set only during a quiet period.
  quietSince: string | null;
};

const pad = (value: number): string => String(value).padStart(2, "0");

const isIsoString = (value: unknown): value is string =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

/** Narrows the RPC's jsonb to the two fields, dropping anything malformed. */
export const parseDataFreshness = (raw: unknown): DataFreshness | null => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const action = row.latest_action_date;
  return {
    lastCheckedAt: isIsoString(row.last_checked_at) ? row.last_checked_at : null,
    latestActionDate:
      typeof action === "string" && /^\d{4}-\d{2}-\d{2}$/.test(action) ? action : null,
  };
};

export const describeFreshness = (freshness: DataFreshness, nowMs: number): FreshnessView => {
  const checkedMs = freshness.lastCheckedAt ? Date.parse(freshness.lastCheckedAt) : NaN;
  const checked = Number.isFinite(checkedMs) ? new Date(checkedMs) : null;
  const checkedDate = checked
    ? `${pad(checked.getMonth() + 1)}/${pad(checked.getDate())}/${checked.getFullYear()}`
    : null;
  const state = checked && nowMs - checkedMs < STALE_AFTER_MS ? "fresh" : "stale";

  let quietSince: string | null = null;
  const match = freshness.latestActionDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  // Only when the check itself is current: if we have not looked lately, the
  // absence of new actions is not evidence of a quiet Legislature.
  if (match && state === "fresh") {
    const [, year, month, day] = match;
    const actionMs = Date.UTC(Number(year), Number(month) - 1, Number(day));
    if (nowMs - actionMs >= QUIET_AFTER_MS) quietSince = `${month}/${day}/${year}`;
  }

  return { state, checkedDate, quietSince };
};

export const DATA_FRESHNESS_QUERY_KEY = ["data-freshness"] as const;

export const fetchDataFreshness = async (): Promise<DataFreshness> => {
  const { data, error } = await supabase.rpc("get_data_freshness");
  if (error) throw error;
  const parsed = parseDataFreshness(data);
  if (!parsed) throw new Error("get_data_freshness returned an unexpected shape");
  return parsed;
};
