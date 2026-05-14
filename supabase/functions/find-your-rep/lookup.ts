export type CacheType = "zip" | "city";

export type NormalizedQuery = {
  cacheable: boolean;
  cacheType: CacheType | null;
  lookupKey: string | null;
  sanitized: string;
};

export class ProviderRequestError extends Error {
  readonly provider: "LocationIQ" | "OpenStates";
  readonly status?: number;

  constructor(provider: "LocationIQ" | "OpenStates", status?: number) {
    super(`${provider} request failed.`);
    this.name = "ProviderRequestError";
    this.provider = provider;
    this.status = status;
  }
}

export function normalizeQuery(query: string): NormalizedQuery {
  const trimmed = query.trim();
  const sanitized = trimmed.replace(/\s+/g, " ").trim();

  const zipMatch = sanitized.match(/^([0-9]{5})(?:-[0-9]{4})?$/);
  const cityCandidate = sanitized
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const isCity = /^[A-Za-z\s]+$/.test(cityCandidate) &&
    cityCandidate.length > 0;

  if (zipMatch) {
    const value = zipMatch[1];
    return {
      cacheable: true,
      cacheType: "zip",
      lookupKey: `zip:${value}`,
      sanitized: value,
    };
  }

  if (isCity) {
    const value = cityCandidate.toLowerCase();
    return {
      cacheable: true,
      cacheType: "city",
      lookupKey: `city:${value}`,
      sanitized,
    };
  }

  return { cacheable: false, cacheType: null, lookupKey: null, sanitized };
}

export function buildLocationIqSearchUrl(
  query: string,
  apiKey: string,
  cacheType: CacheType | null,
): string {
  const url = new URL("https://us1.locationiq.com/v1/search");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  if (cacheType === "zip") {
    url.searchParams.set("postalcode", query);
    url.searchParams.set("countrycodes", "us");
  } else {
    url.searchParams.set("q", query);
  }

  return url.toString();
}

export function representativesFromCache(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function shouldServeCachedResults(
  cacheType: CacheType | null,
  representatives: unknown[],
) {
  return cacheType !== "zip" || representatives.length > 0;
}

export function shouldWriteCacheResults(
  cacheType: CacheType | null,
  representatives: unknown[],
) {
  return cacheType !== "zip" || representatives.length > 0;
}
