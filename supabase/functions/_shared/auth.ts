// supabase/functions/_shared/auth.ts
// Authorization for cron/admin edge functions that run with verify_jwt = false.
//
// The new Supabase API keys (sb_publishable_… / sb_secret_…) are not JWTs, so
// the platform JWT check cannot gate these functions. They instead authorize in
// code, accepting either an admin secret/service key (ops scripts) or the
// scheduler's shared secret (pg_cron), which is validated against Vault.
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseKeyMap, resolveServiceKey } from "./utils.ts";

function presentedCredential(req: Request): string {
  return (
    req.headers.get("apikey") ??
    req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ??
    ""
  ).trim();
}

function bearerToken(req: Request): string | null {
  const match = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** True when the request presents a configured secret/service key. */
function isAdminKeyRequest(req: Request): boolean {
  const presented = presentedCredential(req);
  if (!presented) return false;

  const allowed = new Set<string>();
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacy) allowed.add(legacy);
  for (const value of Object.values(parseKeyMap("SUPABASE_SECRET_KEYS"))) {
    if (typeof value === "string" && value.trim()) allowed.add(value.trim());
  }
  return allowed.has(presented);
}

/**
 * Authorize a server-to-server request to a cron/admin edge function running
 * with `verify_jwt = false`. Accepts either:
 *  - a configured secret/service key on the `apikey` or `Authorization` header
 *    (ops scripts), or
 *  - a valid scheduler secret on `Authorization: Bearer`, validated against
 *    Vault via the `is_valid_bill_sync_secret()` RPC (the pg_cron path).
 *
 * Fails closed (returns false) on any error or missing configuration.
 */
export async function isAuthorizedCronOrAdmin(req: Request): Promise<boolean> {
  if (isAdminKeyRequest(req)) return true;

  const token = bearerToken(req);
  if (!token) return false;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = resolveServiceKey();
  if (!url || !serviceKey) return false;

  try {
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await admin.rpc("is_valid_bill_sync_secret", {
      p_secret: token,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}
