// supabase/functions/send-push-notifications/index.ts

import { serve } from "std/http/server.ts";
// **THE FIX:** The import now uses the 'npm:' specifier to match the deno.json
import { createClient } from "npm:@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const { billId } = await req.json();
    if (!billId) throw new Error("Missing 'billId'");

    // 1. Get the bill details
    const { data: bill, error: billError } = await supabaseAdmin
      .from("bills")
      .select("bill_number, title")
      .eq("id", billId)
      .single();

    if (billError) throw billError;

    // 2. Get the push tokens of users who have bookmarked the bill
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("bookmarks")
      .select("profiles(expo_push_token)")
      .eq("bill_id", billId);

    if (profilesError) throw profilesError;

    const pushTokens = profiles.map((p: any) => p.profiles.expo_push_token).filter(Boolean);

    // 3. Send the push notifications
    const messages = pushTokens.map((token: string) => ({
      to: token,
      sound: "default",
      title: `Upcoming Vote on ${bill.bill_number}`,
      body: bill.title,
      data: { billId },
    }));

    const response = await fetch("https://api.expo.dev/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});