// supabase/functions/find-your-rep/index.ts

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import { corsHeaders } from "../_shared/cors.ts";

type CacheRow = {
  lookup_key: string;
  representatives: unknown;
  expires_at: string | null;
  hit_count: number | null;
  created_at?: string | null;
};

const CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const badRequest = (message: string) => jsonResponse({ error: message }, 400);

function normalizeQuery(query: string): {
  cacheable: boolean;
  cacheType: "zip" | "city" | null;
  lookupKey: string | null;
  sanitized: string;
} {
  const trimmed = query.trim();
  const sanitized = trimmed.replace(/\s+/g, " ").trim();

  const isZip = /^[0-9]{5}(?:-[0-9]{4})?$/.test(sanitized);
  const cityCandidate = sanitized
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const isCity = /^[A-Za-z\s]+$/.test(cityCandidate) && cityCandidate.length > 0;

  if (isZip) {
    const value = sanitized.replace(/\s+/g, "");
    return { cacheable: true, cacheType: "zip", lookupKey: `zip:${value}`, sanitized };
  }

  if (isCity) {
    const value = cityCandidate.toLowerCase();
    return { cacheable: true, cacheType: "city", lookupKey: `city:${value}`, sanitized };
  }

  return { cacheable: false, cacheType: null, lookupKey: null, sanitized };
}

async function fetchGeocode(query: string, apiKey: string) {
  const url = new URL("https://us1.locationiq.com/v1/search");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LocationIQ request failed (${res.status}). ${text || "Try again later."}`);
  }

  const matches = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error("Address not found. Try a more specific location.");
  }

  const { lat, lon } = matches[0] ?? {};
  if (!lat || !lon) throw new Error("LocationIQ returned invalid coordinates.");
  return { lat: parseFloat(lat), lon: parseFloat(lon) };
}

async function fetchRepresentatives(lat: number, lon: number, apiKey: string) {
  const url = new URL("https://v3.openstates.org/people.geo");
  url.searchParams.set("lat", lat.toString());
  url.searchParams.set("lng", lon.toString());

  const res = await fetch(url.toString(), {
    headers: {
      "X-API-KEY": apiKey,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenStates request failed (${res.status}). ${text || "Try again later."}`);
  }

  const payload = await res.json();
  if (payload?.error?.message) {
    throw new Error(`OpenStates error: ${payload.error.message}`);
  }

  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { query } = await req.json();
    if (!query || typeof query !== "string" || !query.trim()) {
      return badRequest("A non-empty 'query' string is required.");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase service credentials are not configured.");
    }

    const locationIqKey =
      Deno.env.get("LOCATIONIQ_API_KEY") ?? Deno.env.get("EXPO_PUBLIC_LOCATIONIQ_API_KEY");
    const openStatesKey =
      Deno.env.get("OPENSTATES_API_KEY") ?? Deno.env.get("EXPO_PUBLIC_OPENSTATES_API_KEY");

    if (!locationIqKey || !openStatesKey) {
      throw new Error("Required LocationIQ/OpenStates API keys are not configured.");
    }

    const { cacheable, cacheType, lookupKey, sanitized } = normalizeQuery(query);
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const nowIso = new Date().toISOString();
    let cachedRow: CacheRow | null = null;

    if (cacheable && lookupKey) {
      const { data, error: cacheError } = await supabase
        .from("location_lookup_cache")
        .select("lookup_key, representatives, expires_at, hit_count, created_at")
        .eq("lookup_key", lookupKey)
        .maybeSingle();

      if (cacheError) {
        console.error("Cache lookup failed:", cacheError);
      } else if (data) {
        cachedRow = data as CacheRow;
        const expiresAt = cachedRow.expires_at ? new Date(cachedRow.expires_at).getTime() : 0;
        if (expiresAt > Date.now()) {
          const refreshedExpiry = new Date(Date.now() + CACHE_TTL_MS).toISOString();
          await supabase
            .from("location_lookup_cache")
            .update({
              hit_count: (cachedRow.hit_count ?? 0) + 1,
              last_hit_at: nowIso,
              updated_at: nowIso,
              expires_at: refreshedExpiry,
            })
            .eq("lookup_key", lookupKey);

          return jsonResponse({
            results: cachedRow.representatives ?? [],
            cacheable: true,
            source: "cache",
          });
        }
      }
    }

    const { lat, lon } = await fetchGeocode(sanitized, locationIqKey);
    const representatives = await fetchRepresentatives(lat, lon, openStatesKey);

    if (cacheable && lookupKey && cacheType) {
      const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString();
      const payload = {
        lookup_key: lookupKey,
        raw_query: sanitized,
        query_type: cacheType,
        lat,
        lon,
        representatives,
        hit_count: (cachedRow?.hit_count ?? 0) + 1,
        created_at: cachedRow?.created_at ?? nowIso,
        updated_at: nowIso,
        last_hit_at: nowIso,
        expires_at: expiresAt,
      };

      const { error: upsertError } = await supabase
        .from("location_lookup_cache")
        .upsert(payload, { onConflict: "lookup_key" });

      if (upsertError) {
        console.error("Failed to upsert location cache:", upsertError);
      }
    }

    return jsonResponse({
      results: representatives,
      cacheable,
      source: "fresh",
      lat,
      lon,
    });
  } catch (error) {
    console.error("find-your-rep function failed:", error);
    return jsonResponse({ error: (error as Error).message ?? "Unexpected error." }, 500);
  }
});
