import { getConfig } from "./config";
import { normalizeZip } from "./location";

export type GeoPoint = { lat: number; lon: number };

export class ZipGeocodeRateLimitError extends Error {
  readonly zip: string;
  readonly status: number;

  constructor(zip: string, status: number) {
    super("ZIP geocoding temporarily limited. Enter a street address for best results.");
    this.name = "ZipGeocodeRateLimitError";
    this.zip = zip;
    this.status = status;
  }
}

export async function geocodeZip(zip: string): Promise<GeoPoint | null> {
  const z = normalizeZip(zip);
  if (!z) return null;

  let locationIqKey: string;
  try {
    locationIqKey = getConfig().locationIqApiKey;
  } catch (error) {
    console.error("geocodeZip: missing LocationIQ key", error);
    return null;
  }

  const url = `https://us1.locationiq.com/v1/search.php?key=${encodeURIComponent(
    locationIqKey,
  )}&postalcode=${encodeURIComponent(z)}&countrycodes=us&format=json&limit=1`;

  try {
    const res = await fetch(url);

    if (res.status === 429 || res.status === 402) {
      console.warn(`geocodeZip: rate limited for ZIP ${z} (status ${res.status}).`);
      throw new ZipGeocodeRateLimitError(z, res.status);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`geocodeZip: non-200 response (${res.status}). ${text}`);
      return null;
    }

    const data = await res.json();
    if (!Array.isArray(data) || !data[0]?.lat || !data[0]?.lon) {
      return null;
    }

    const lat = Number(data[0].lat);
    const lon = Number(data[0].lon);

    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      return null;
    }

    return { lat, lon };
  } catch (error) {
    if (error instanceof ZipGeocodeRateLimitError) {
      throw error;
    }
    console.error(`geocodeZip: lookup failed for ZIP ${z}`, error);
    return null;
  }
}
