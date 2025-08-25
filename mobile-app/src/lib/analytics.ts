// mobile-app/src/lib/analytics.ts

import { supabase } from './supabase';

type EventType = 'bill_view' | 'share' | 'save' | 'email_open';

interface EventPayload {
  bill_id?: number;
  // You can add other relevant fields here in the future
}

/**
 * Tracks an analytics event and sends it to the Supabase database.
 * This is a "fire-and-forget" function and will not throw errors.
 *
 * @param type The type of event to track.
 * @param userId The anonymous ID of the user performing the action.
 * @param payload Additional data associated with the event.
 */
export function trackEvent(
  type: EventType,
  userId: string | undefined,
  payload: EventPayload = {},
): void {
  if (!userId) {
    // We can still track events without a user ID if we choose,
    // but for now, we'll only track events for authenticated (anonymous) users.
    return;
  }

  const eventData = {
    user_id: userId,
    type: type,
    ...payload,
  };

  // We don't await this call. It runs in the background.
  supabase
    .from('events')
    .insert(eventData)
    .then(({ error }) => {
      if (error) {
        console.warn(`Analytics trackEvent failed for type '${type}':`, error.message);
      }
    });
}