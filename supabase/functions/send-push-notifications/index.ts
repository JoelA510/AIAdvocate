// supabase/functions/send-push-notifications/index.ts

import { serve } from "std/http/server.ts";
// **THE FIX:** The import now uses the 'npm:' specifier to match the deno.json
import { createClient } from "npm:@supabase/supabase-js@2";
import { getServiceKey } from "../_shared/utils.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { isAuthorizedCronOrAdmin } from "../_shared/auth.ts";

// Expo rejects push requests with more than 100 messages, so fan out in chunks.
const EXPO_PUSH_BATCH_SIZE = 100;
// PostgREST serializes `.in(...)` filters into the request URL, so keep each id
// list small enough that a heavily-bookmarked bill cannot overflow the URI
// length limit (414 Request-URI Too Large).
const ID_QUERY_CHUNK_SIZE = 100;
// PostgREST caps a single response (default 1000 rows); page reads so a popular
// bill's full recipient list is captured rather than silently truncated.
const BOOKMARK_PAGE_SIZE = 1000;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

/**
 * Extract a human-readable message from an unknown error. PostgREST errors are
 * plain objects (not `Error` instances) carrying a `message` field, so a bare
 * `String(error)` would yield "[object Object]". Used for server-side logging
 * only — never returned to the caller.
 */
function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // This function fans out to every user who bookmarked a bill using the
  // service-role key, so it must only run for the cron/ops paths. It runs with
  // verify_jwt = false (the cron's non-JWT apikey cannot satisfy the platform
  // check), so authorize in code exactly like votes-daily: an admin secret/
  // service key, or the scheduler SYNC_SECRET validated against Vault.
  if (!(await isAuthorizedCronOrAdmin(req))) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const serviceRoleKey = getServiceKey();
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!supabaseUrl) throw new Error("SUPABASE_URL must be set");
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => null);
    const billId = body?.billId;
    if (billId === undefined || billId === null || billId === "") {
      throw new Error("Missing 'billId'");
    }
    // Optional context from the upcoming-vote scheduler (notify_upcoming_votes):
    //  - eventDate: the calendar date (YYYY-MM-DD) this notification is for. When
    //    present, recipients already delivery-confirmed for this (bill, eventDate)
    //    are excluded up front, and a ledger row is written per recipient only
    //    AFTER their confirmed send -- so a retry re-targets exactly the
    //    recipients still missing one, never the whole bill.
    //  - eventLabel: the calendar entry's type/description, rendered in the title.
    const eventDate = typeof body?.eventDate === "string" && body.eventDate.trim()
      ? body.eventDate.trim()
      : null;
    const rawEventLabel = typeof body?.eventLabel === "string" ? body.eventLabel.trim() : "";
    const eventLabel = (rawEventLabel || "activity").slice(0, 50);

    // 1. Get the bill details
    const { data: bill, error: billError } = await supabaseAdmin
      .from("bills")
      .select("bill_number, title")
      .eq("id", billId)
      .single();

    if (billError) throw billError;
    if (!bill) throw new Error(`Bill ${billId} not found`);

    // 2. Find the users who bookmarked this bill. Page through results so a
    //    bill with more than one PostgREST page of bookmarks (default 1000
    //    rows) does not silently drop recipients.
    const bookmarkRows: Array<{ user_id?: string | null }> = [];
    for (let from = 0; ; from += BOOKMARK_PAGE_SIZE) {
      const { data, error: bookmarksError } = await supabaseAdmin
        .from("bookmarks")
        .select("user_id")
        .eq("bill_id", billId)
        // Order so `range()` paging is deterministic; without it a concurrent
        // insert could shift a row across a page boundary and skip a recipient.
        .order("user_id", { ascending: true })
        .range(from, from + BOOKMARK_PAGE_SIZE - 1);
      if (bookmarksError) {
        // When the bookmark count is an exact multiple of the page size, the
        // trailing request starts past the last row and PostgREST answers 416
        // (PGRST103). Treat that as "no more rows" rather than a hard failure.
        if ((bookmarksError as { code?: string }).code === "PGRST103") break;
        throw bookmarksError;
      }
      if (!data || data.length === 0) break;
      bookmarkRows.push(...data);
      if (data.length < BOOKMARK_PAGE_SIZE) break;
    }

    let userIds = Array.from(
      new Set(
        bookmarkRows
          .map((row) => row?.user_id)
          .filter((id: string | null | undefined): id is string => Boolean(id)),
      ),
    );

    if (userIds.length === 0) {
      return jsonResponse({ sent: 0, message: "No bookmarks for this bill." });
    }

    // 2b. For scheduler calls (eventDate present), exclude recipients already
    //     delivery-confirmed for this (bill, event date) -- per-recipient
    //     dedup, so a retry only re-targets users who are actually still
    //     missing a confirmed ticket, instead of re-notifying everyone
    //     (duplicates) or requiring the whole bill to be untouched (the
    //     original bug: one failed batch permanently suppressed retry for
    //     every other recipient too).
    if (eventDate) {
      const alreadyNotified = new Set<string>();
      for (let i = 0; i < userIds.length; i += ID_QUERY_CHUNK_SIZE) {
        const chunk = userIds.slice(i, i + ID_QUERY_CHUNK_SIZE);
        const { data, error: recipientsError } = await supabaseAdmin
          .from("push_notification_recipients")
          .select("user_id")
          .eq("bill_id", billId)
          .eq("event_date", eventDate)
          .in("user_id", chunk);
        if (recipientsError) throw recipientsError;
        (data ?? []).forEach((row) => {
          if (row?.user_id) alreadyNotified.add(row.user_id);
        });
      }
      userIds = userIds.filter((id) => !alreadyNotified.has(id));
    }

    if (userIds.length === 0) {
      return jsonResponse({ sent: 0, message: "All bookmarkers already notified for this event." });
    }

    // 3. Look up their Expo push tokens. Tokens live in `user_push_tokens`,
    //    not on `profiles`. Keep (user_id, expo_token) pairs -- not just a
    //    flat token list -- so a confirmed delivery can be attributed back
    //    to the owning user for per-recipient dedup (a user may have more
    //    than one device/token since the multi-device fix).
    const tokenRows: Array<{ user_id?: string | null; expo_token?: string | null }> = [];
    for (let i = 0; i < userIds.length; i += ID_QUERY_CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + ID_QUERY_CHUNK_SIZE);
      const { data, error: tokensError } = await supabaseAdmin
        .from("user_push_tokens")
        .select("user_id, expo_token")
        .in("user_id", chunk);
      if (tokensError) throw tokensError;
      if (data) tokenRows.push(...data);
    }

    type Recipient = { userId: string; token: string };
    const seenTokens = new Set<string>();
    const recipients: Recipient[] = [];
    for (const row of tokenRows) {
      if (!row?.user_id || !row?.expo_token) continue;
      if (seenTokens.has(row.expo_token)) continue;
      seenTokens.add(row.expo_token);
      recipients.push({ userId: row.user_id, token: row.expo_token });
    }

    if (recipients.length === 0) {
      return jsonResponse({ sent: 0, message: "No push tokens registered for recipients." });
    }

    // 4. Build the messages and fan out to Expo in batches of 100. A failure
    //    in one batch is recorded but does not abort delivery of the others.
    //    ticketsByIndex stays aligned 1:1 with `recipients` (null for any
    //    slot whose batch failed) so a confirmed ticket can be attributed
    //    back to the specific recipient that earned it.
    const messages = recipients.map(({ token }) => ({
      to: token,
      sound: "default",
      title: `Upcoming ${eventLabel}: ${bill.bill_number ?? "a tracked bill"}`,
      body: bill.title ?? "",
      data: { billId },
    }));

    const ticketsByIndex: Array<unknown | null> = new Array(messages.length).fill(null);
    let failedBatches = 0;
    for (let i = 0; i < messages.length; i += EXPO_PUSH_BATCH_SIZE) {
      const batchIndex = i / EXPO_PUSH_BATCH_SIZE;
      const batch = messages.slice(i, i + EXPO_PUSH_BATCH_SIZE);
      try {
        const response = await fetch("https://api.expo.dev/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
          },
          body: JSON.stringify(batch),
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          failedBatches += 1;
          console.error(
            `send-push-notifications: Expo batch ${batchIndex} failed (${response.status}):`,
            payload,
          );
          continue;
        }

        const batchTickets = Array.isArray(payload?.data)
          ? payload.data
          : payload != null
            ? [payload]
            : [];
        // Expo returns one ticket per message, in the same order as sent.
        batchTickets.forEach((ticket: unknown, idx: number) => {
          if (i + idx < ticketsByIndex.length) ticketsByIndex[i + idx] = ticket;
        });
      } catch (batchError) {
        failedBatches += 1;
        console.error(
          `send-push-notifications: Expo batch ${batchIndex} threw:`,
          describeError(batchError),
        );
      }
    }

    // Expo returns HTTP 200 with a push *ticket* per message even when the push
    // was rejected (status "error", e.g. DeviceNotRegistered / MessageRateExceeded),
    // so a non-null ticket does not mean anything was delivered. Count only
    // accepted ("ok") tickets -- the real "delivery confirmed" signal.
    const acceptedIndices: number[] = [];
    ticketsByIndex.forEach((ticket, idx) => {
      if (
        !!ticket && typeof ticket === "object" &&
        (ticket as { status?: unknown }).status === "ok"
      ) {
        acceptedIndices.push(idx);
      }
    });
    const acceptedCount = acceptedIndices.length;

    // Per-recipient delivery-confirmed dedup: record only the specific users
    // who got a confirmed ("ok") ticket -- not the whole bill -- so the next
    // notify_upcoming_votes run only re-targets recipients who are actually
    // still missing one, regardless of whether other batches failed.
    if (eventDate && acceptedCount > 0) {
      const notifiedUserIds = Array.from(
        new Set(acceptedIndices.map((idx) => recipients[idx].userId)),
      );
      const rows = notifiedUserIds.map((userId) => ({
        bill_id: billId,
        event_date: eventDate,
        user_id: userId,
      }));
      const { error: ledgerError } = await supabaseAdmin
        .from("push_notification_recipients")
        .upsert(rows, { onConflict: "bill_id,event_date,user_id" });
      if (ledgerError) {
        // Non-fatal: a missing ledger row only risks a duplicate on the next run.
        console.error(
          "send-push-notifications: failed recording push_notification_recipients:",
          describeError(ledgerError),
        );
      }
    }

    const tickets = ticketsByIndex.filter((ticket) => ticket !== null);
    return jsonResponse({ sent: acceptedCount, failedBatches, tickets });
  } catch (error) {
    // Log details server-side; return a generic message so internal error
    // details (and any stack information) are not exposed to the caller.
    console.error("send-push-notifications failed:", describeError(error));
    return jsonResponse({ error: "Failed to send push notifications." }, 500);
  }
});
