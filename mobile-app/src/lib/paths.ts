import type { Href } from "expo-router";

type RepProfileOrigin = "bills" | "advocacy";

type RepProfilePayload = string | Record<string, unknown> | null | undefined;

type RepProfileParams = {
  id: string;
  payload?: RepProfilePayload;
  billId?: string | null;
};

const REP_PROFILE_ROUTES: Record<RepProfileOrigin, string> = {
  bills: "/legislator/[id]",
  advocacy: "/(tabs)/advocacy/legislator/[id]",
};

const normalizePayload = (payload: RepProfilePayload): string | null => {
  if (payload === undefined || payload === null) return null;
  if (typeof payload === "string") return payload;
  if (typeof payload === "object") {
    try {
      return JSON.stringify(payload);
    } catch (err) {
      console.warn("Failed to serialize legislator payload", err);
      return null;
    }
  }
  return String(payload);
};

const cleanParams = (
  params: RepProfileParams,
  origin: RepProfileOrigin,
): Record<string, string> => {
  const augmented: Record<string, unknown> = {
    ...params,
    payload: normalizePayload(params.payload),
    originTab: origin,
  };

  const entries = Object.entries(augmented).filter(
    ([, value]) => value !== undefined && value !== null,
  );

  return Object.fromEntries(entries.map(([key, value]) => [key, String(value)]));
};

export const PATHS = {
  HOME: "/" as const,
  ADVOCACY: "/advocacy" as const,
  repProfileIn: (origin: RepProfileOrigin, params: RepProfileParams): Href => {
    const pathname = REP_PROFILE_ROUTES[origin] ?? REP_PROFILE_ROUTES.advocacy;
    return { pathname, params: cleanParams(params, origin) } as Href;
  },
} as const;
