// supabase/functions/send-push-notifications/index.ts

import { serve } from "std/http/server.ts";
// **THE FIX:** The import now uses the 'npm:' specifier to match the deno.json
import { createClient } from "npm:@supabase/supabase-js@2";
import { getServiceKey } from "../_shared/utils.ts";

// Expo rejects push requests with more than 100 messages, so fan out in chunks.
const EXPO_PUSH_BATCH_SIZE = 100;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { "Content-Type": "application/json" },
    status,
  });

serve(async (req) => {
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

    // 2. Find the users who bookmarked this bill.
    const { data: bookmarkRows, error: bookmarksError } = await supabaseAdmin
      .from("bookmarks")
      .select("user_id")
      .eq("bill_id", billId);

    if (bookmarksError) throw bookmarksError;

    const userIds = Array.from(
      new Set(
        (bookmarkRows ?? [])
          .map((row: { user_id?: string | null }) => row?.user_id)
          .filter((id: string | null | undefined): id is string => Boolean(id)),
      ),
    );

    if (userIds.length === 0) {
      return jsonResponse({ sent: 0, message: "No bookmarks for this bill." });
    }

    // 3. Look up their Expo push tokens. Tokens live in `user_push_tokens`,
    //    not on `profiles`, so this requires a second query.
    const { data: tokenRows, error: tokensError } = await supabaseAdmin
      .from("user_push_tokens")
      .select("expo_token")
      .in("user_id", userIds);

    if (tokensError) throw tokensError;

    const pushTokens = Array.from(
      new Set(
        (tokenRows ?? [])
          .map((row: { expo_token?: string | null }) => row?.expo_token)
          .filter((token: string | null | undefined): token is string => Boolean(token)),
      ),
    );

    if (pushTokens.length === 0) {
      return jsonResponse({ sent: 0, message: "No push tokens registered for recipients." });
    }

    // 4. Build the messages and fan out to Expo in batches of 100.
    const messages = pushTokens.map((token: string) => ({
      to: token,
      sound: "default",
      title: `Upcoming Vote on ${bill.bill_number ?? "a tracked bill"}`,
      body: bill.title ?? "",
      data: { billId },
    }));

    const tickets: unknown[] = [];
    for (let i = 0; i < messages.length; i += EXPO_PUSH_BATCH_SIZE) {
      const batch = messages.slice(i, i + EXPO_PUSH_BATCH_SIZE);
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
        throw new Error(
          `Expo push request failed (${response.status}): ${JSON.stringify(payload)}`,
        );
      }

      if (Array.isArray(payload?.data)) {
        tickets.push(...payload.data);
      } else if (payload != null) {
        tickets.push(payload);
      }
    }

    return jsonResponse({ sent: messages.length, tickets });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
