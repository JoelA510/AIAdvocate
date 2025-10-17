// mobile-app/src/lib/find-your-representative.ts

import { supabase } from "./supabase";
import { getConfig } from "./config";
import { safeFetch } from "./safeFetch";
import { geocodeZip, ZipGeocodeRateLimitError } from "./geocode";
import { isUsZip, normalizeZip } from "./location";

type LocationIQMatch = { lat: string; lon: string };

type OpenStatesGeoResponse = {
  results?: any[];
  error?: { message?: string };
};

type FunctionResponse =
  | {
      results?: any[];
      error?: string;
    }
  | any[];

/**
 * Fetch nearby state legislators for a user-supplied address.
 * Prefers the Supabase Edge function (which applies caching) and falls back to the
 * client-side fetch pipeline if the function is unavailable.
 * Adds a ZIP-only fallback that approximates representation using the ZIP centroid.
 */
export async function findYourRep(address: string): Promise<any[]> {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new Error("Please enter a location.");
  }

  const needsZipFallback = isUsZip(trimmed);

  let primaryResults: any[] | null = null;
  try {
    primaryResults = await invokeEdgeFunction(trimmed);
  } catch (fnError) {
    console.warn(
      "Supabase find-your-rep function unavailable. Falling back to direct lookup.",
      fnError,
    );
  }

  if (primaryResults !== null) {
    if (primaryResults.length > 0) {
      return primaryResults;
    }

    if (needsZipFallback) {
      const approx = await attemptZipFallback(trimmed);
      if (approx.length > 0) {
        return approx;
      }
    }

    return primaryResults;
  }

  try {
    const fallbackResults = await fallbackLookup(trimmed);
    if (fallbackResults.length > 0) {
      return fallbackResults;
    }

    if (needsZipFallback) {
      const approx = await attemptZipFallback(trimmed);
      if (approx.length > 0) {
        return approx;
      }
    }

    return fallbackResults;
  } catch (fallbackError) {
    if (needsZipFallback) {
      try {
        const approx = await attemptZipFallback(trimmed);
        if (approx.length > 0) {
          return approx;
        }
      } catch (zipError) {
        if (zipError instanceof ZipGeocodeRateLimitError) {
          throw zipError;
        }
        console.error("ZIP fallback failed", zipError);
      }
    }

    throw fallbackError;
  }
}

async function invokeEdgeFunction(query: string): Promise<any[]> {
  const { data, error } = await supabase.functions.invoke<FunctionResponse>("find-your-rep", {
    body: { query },
  });

  if (error) {
    throw new Error(error.message ?? "find-your-rep function returned an error.");
  }

  if (Array.isArray(data)) return data;

  if (data?.error) {
    throw new Error(data.error);
  }

  if (Array.isArray(data?.results)) {
    return data.results;
  }

  throw new Error("Unexpected response from find-your-rep function.");
}

async function fallbackLookup(query: string): Promise<any[]> {
  const { openstatesApiKey, locationIqApiKey } = getConfig();

  if (!openstatesApiKey || !locationIqApiKey) {
    throw new Error(
      "API Key(s) missing: EXPO_PUBLIC_OPENSTATES_API_KEY and/or EXPO_PUBLIC_LOCATIONIQ_API_KEY. " +
        "Check mobile-app/.env and restart `expo start`.",
    );
  }

  const geoRes = await safeFetch(
    `https://us1.locationiq.com/v1/search?key=${encodeURIComponent(
      locationIqApiKey,
    )}&q=${encodeURIComponent(query)}&format=json&limit=1`,
    { retries: 2, retryDelayMs: 500 },
  );

  const matches = (await geoRes.json()) as LocationIQMatch[];
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error("Address not found. Try a more specific address.");
  }

  const { lat, lon } = matches[0];
  return fetchOpenStatesPeople(lat, lon, openstatesApiKey);
}

export async function findYourRepByCoords(lat: number, lon: number): Promise<any[]> {
  const { openstatesApiKey } = getConfig();

  if (!openstatesApiKey) {
    throw new Error(
      "Missing EXPO_PUBLIC_OPENSTATES_API_KEY. Check mobile-app/.env and restart `expo start`.",
    );
  }

  return fetchOpenStatesPeople(lat, lon, openstatesApiKey);
}

async function fetchOpenStatesPeople(
  lat: string | number,
  lon: string | number,
  apiKey: string,
): Promise<any[]> {
  const peopleUrl = `https://v3.openstates.org/people.geo?lat=${encodeURIComponent(
    String(lat),
  )}&lng=${encodeURIComponent(String(lon))}`;

  const peopleRes = await fetch(peopleUrl, {
    method: "GET",
    headers: {
      "X-API-KEY": apiKey,
      Accept: "application/json",
    },
  });

  if (!peopleRes.ok) {
    const text = await peopleRes.text().catch(() => "");
    throw new Error(
      `OpenStates request failed (${peopleRes.status}). ${text || "Please try again later."}`,
    );
  }

  const people = (await peopleRes.json()) as OpenStatesGeoResponse;

  if (people?.error?.message) {
    throw new Error(`OpenStates error: ${people.error.message}`);
  }

  return Array.isArray(people.results) ? people.results : [];
}

async function attemptZipFallback(input: string): Promise<any[]> {
  try {
    const geo = await geocodeZip(input);
    if (!geo) return [];

    const byCoords = await findYourRepByCoords(geo.lat, geo.lon);
    if (!Array.isArray(byCoords) || byCoords.length === 0) {
      return [];
    }

    const normalized = normalizeZip(input);
    return byCoords.map((person) => ({
      ...person,
      _approximate: true,
      _approx_source: "zip-centroid",
      _approx_zip: normalized,
    }));
  } catch (error) {
    if (error instanceof ZipGeocodeRateLimitError) {
      throw error;
    }

    console.error("attemptZipFallback failed", error);
    return [];
  }
}
