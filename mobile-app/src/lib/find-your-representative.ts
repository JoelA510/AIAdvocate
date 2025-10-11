// mobile-app/src/lib/find-your-representative.ts

import { supabase } from "./supabase";
import { getConfig } from "./config";
import { safeFetch } from "./safeFetch";

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
 */
export async function findYourRep(address: string): Promise<any[]> {
  const trimmed = address.trim();
  if (!trimmed) {
    throw new Error("Please enter a location.");
  }

  try {
    const { data, error } = await supabase.functions.invoke<FunctionResponse>("find-your-rep", {
      body: { query: trimmed },
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
  } catch (fnError) {
    console.warn(
      "Supabase find-your-rep function unavailable. Falling back to direct lookup.",
      fnError,
    );
    return fallbackLookup(trimmed);
  }
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

  const peopleUrl = `https://v3.openstates.org/people.geo?lat=${encodeURIComponent(
    lat,
  )}&lng=${encodeURIComponent(lon)}`;

  const peopleRes = await fetch(peopleUrl, {
    method: "GET",
    headers: {
      "X-API-KEY": openstatesApiKey,
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
