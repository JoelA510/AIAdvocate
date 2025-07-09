import { serve } from "std/http/server.ts";
import { initializeApp, cert } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-firebase-appcheck",
};

// Initialize Firebase Admin SDK
try {
  const serviceAccount = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT_KEY")!);
  initializeApp({
    credential: cert(serviceAccount),
  });
} catch (e) {
  if (!e.message.includes("already exists")) {
    console.error("Firebase Admin SDK initialization failed:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const appCheckToken = req.headers.get("X-Firebase-AppCheck");
    if (!appCheckToken) {
      throw new Error("App Check token is required.");
    }

    await getAppCheck().verifyToken(appCheckToken);
    
    console.log("App Check token successfully verified.");

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error during App Check verification:", error.message);
    return new Response(
      JSON.stringify({ error: "Unauthorized: Invalid App Check token." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      }
    );
  }
});