// scripts/supabaseHeaders.mjs
// Build Supabase auth headers compatible with BOTH legacy JWT keys and the new
// publishable/secret keys.
//
// The new keys (sb_publishable_… / sb_secret_…) are NOT JWTs and must travel on
// the `apikey` header ONLY. Sending one on `Authorization: Bearer` makes the
// platform try to parse it as a JWT and reject the request with "Invalid JWT".
// Legacy keys (eyJ…) keep using both headers, preserving current behavior.
export function supabaseAuthHeaders(key, extra = {}) {
  const headers = { apikey: key, ...extra };
  if (typeof key === "string" && key.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${key}`;
  }
  return headers;
}
