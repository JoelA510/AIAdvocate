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

    const userIds = Array.from(
      new Set(
        bookmarkRows
          .map((row) => row?.user_id)
          .filter((id: string | null | undefined): id is string => Boolean(id)),
      ),
    );

    if (userIds.length === 0) {
      return jsonResponse({ sent: 0, message: "No bookmarks for this bill." });
    }

    // 3. Look up their Expo push tokens. Tokens live in `user_push_tokens`, not
    //    on `profiles`. Chunk the id list so the `.in(...)` filter cannot
    //    overflow the PostgREST request URL for heavily-bookmarked bills.
    const tokenRows: Array<{ expo_token?: string | null }> = [];
    for (let i = 0; i < userIds.length; i += ID_QUERY_CHUNK_SIZE) {
      const chunk = userIds.slice(i, i + ID_QUERY_CHUNK_SIZE);
      const { data, error: tokensError } = await supabaseAdmin
        .from("user_push_tokens")
        .select("expo_token")
        .in("user_id", chunk);
      if (tokensError) throw tokensError;
      if (data) tokenRows.push(...data);
    }

    const pushTokens = Array.from(
      new Set(
        tokenRows
          .map((row) => row?.expo_token)
          .filter((token: string | null | undefined): token is string => Boolean(token)),
      ),
    );

    if (pushTokens.length === 0) {
      return jsonResponse({ sent: 0, message: "No push tokens registered for recipients." });
    }

    // 4. Build the messages and fan out to Expo in batches of 100. A failure in
    //    one batch is recorded but does not abort delivery of the others, so a
    //    single bad token or transient error cannot drop every notification.
    const messages = pushTokens.map((token: string) => ({
      to: token,
      sound: "default",
      title: `Upcoming Vote on ${bill.bill_number ?? "a tracked bill"}`,
      body: bill.title ?? "",
      data: { billId },
    }));

    const tickets: unknown[] = [];
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

        if (Array.isArray(payload?.data)) {
          tickets.push(...payload.data);
        } else if (payload != null) {
          tickets.push(payload);
        }
      } catch (batchError) {
        failedBatches += 1;
        console.error(
          `send-push-notifications: Expo batch ${batchIndex} threw:`,
          describeError(batchError),
        );
      }
    }

    return jsonResponse({ sent: tickets.length, failedBatches, tickets });
  } catch (error) {
    // Log details server-side; return a generic message so internal error
    // details (and any stack information) are not exposed to the caller.
    console.error("send-push-notifications failed:", describeError(error));
    return jsonResponse({ error: "Failed to send push notifications." }, 500);
  }
});
