// mobile-app/src/lib/analytics.ts
import { supabase } from "./supabase";

/**
 * Lightweight, no-throw analytics logger.
 * - Always returns a Promise<void>
 * - Never throws (swallows RLS/HTTP errors)
 * - Safe to call on web and native
 *
 * public.events only has columns (id, ts, user_id, type, bill_id) -- there is
 * no payload/platform column, so only bill_id (when present in payload) is
 * persisted. An RLS policy permits authenticated inserts where
 * auth.uid() = user_id.
 */

export type AnalyticsPayload = Record<string, unknown>;

export async function trackEvent(
  type: string,
  userId?: string | null,
  payload?: AnalyticsPayload,
): Promise<void> {
  try {
    // If there is no user (anon or not yet available), just no-op.
    if (!userId) return;

    const billId = typeof payload?.bill_id === "number" ? payload.bill_id : null;

    const { error } = await supabase.from("events").insert([
      {
        type,
        user_id: userId,
        bill_id: billId,
      },
    ]);

    if (error) {
      // Don't throw—just log at debug level to avoid noisy consoles.
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.debug("trackEvent suppressed error:", error.message);
      }
    }
  } catch (e: any) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.debug("trackEvent caught exception:", e?.message ?? e);
    }
    // swallow
  }
}
