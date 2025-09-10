// mobile-app/src/lib/analytics.ts
import { Platform } from "react-native";
import { supabase } from "./supabase";

/**
 * Lightweight, no-throw analytics logger.
 * - Always returns a Promise<void>
 * - Never throws (swallows RLS/HTTP errors)
 * - Safe to call on web and native
 *
 * NOTE: With RLS on `events`, direct inserts may 403 on the client.
 * This function intentionally swallows those failures.
 * Later we can switch this to an Edge Function (service role) and keep the API intact.
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

    // Attempt a direct insert; RLS may block this (expected in dev).
    const { error } = await supabase.from("events").insert([
      {
        type,
        user_id: userId,
        payload: payload ?? {},
        platform: Platform.OS,
      },
    ]);

    if (error) {
      // Don’t throw—just log at debug level to avoid noisy consoles.
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
