// mobile-app/src/lib/find-your-representative.ts

import { getConfig } from './config';

export const findYourRep = async (address: string) => {
  const config = getConfig();
  const openStatesApiKey = config.EXPO_PUBLIC_OPENSTATES_API_KEY;
  const locationIqApiKey = config.EXPO_PUBLIC_LOCATIONIQ_API_KEY;

  if (!openStatesApiKey || !locationIqApiKey) {
    console.error("API Key(s) are missing from .env file.");
    return null;
  }

  try {
    // Step 1: Geocode the address
    const geocodeUrl = `https://us1.locationiq.com/v1/search?key=${locationIqApiKey}&q=${encodeURIComponent(address)}&format=json`;
    const geocodeResponse = await fetch(geocodeUrl);
    const geocodeData = await geocodeResponse.json();
    if (!geocodeResponse.ok || !Array.isArray(geocodeData) || geocodeData.length === 0) {
      console.error("LocationIQ Geocoding Error:", geocodeData?.error || 'Failed to geocode address.');
      return null;
    }
    const { lat, lon } = geocodeData[0];

    // Step 2: Find legislators with a single, simple call
    const searchUrl = `https://v3.openstates.org/people.geo?lat=${lat}&lng=${lon}`;
    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: { 'X-API-KEY': openStatesApiKey },
    });
    const searchData = await searchResponse.json();
    if (!searchResponse.ok) {
      console.error("OpenStates Search Error:", searchData.detail || 'Search failed.');
      return null;
    }
    
    // The data is complete from this one call.
    return searchData;

  } catch (error) {
    console.error("Failed to fetch representatives:", error);
    return null;
  }
};