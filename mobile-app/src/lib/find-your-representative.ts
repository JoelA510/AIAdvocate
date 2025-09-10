// mobile-app/src/lib/find-your-representative.ts

import { getConfig } from "./config";
import { safeFetch } from "./safeFetch";

type LocationIQMatch = { lat: string; lon: string };

type OpenStatesGeoResponse = {
  results?: any[];
  error?: { message?: string };
};

/**
 * Geocode the user's address (LocationIQ) and fetch nearby state legislators (OpenStates v3).
 * Returns an ARRAY of people, not { results }.
 * Throws with a helpful message on failure (caller should catch and display).
 */
export async function findYourRep(address: string) {
  const { openstatesApiKey, locationIqApiKey } = getConfig();

  if (!openstatesApiKey || !locationIqApiKey) {
    throw new Error(
      "API Key(s) missing: EXPO_PUBLIC_OPENSTATES_API_KEY and/or EXPO_PUBLIC_LOCATIONIQ_API_KEY. " +
        "Check mobile-app/.env and restart `expo start`.",
    );
  }

  // 1) Geocode with LocationIQ
  const geoRes = await safeFetch(
    `https://us1.locationiq.com/v1/search?key=${encodeURIComponent(
      locationIqApiKey,
    )}&q=${encodeURIComponent(address)}&format=json&limit=1`,
    { retries: 2, retryDelayMs: 500 },
  );

  const matches = (await geoRes.json()) as LocationIQMatch[];
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error("Address not found. Try a more specific address.");
  }
  const { lat, lon } = matches[0];

  // 2) OpenStates people.geo — use header for API key (preferred)
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
