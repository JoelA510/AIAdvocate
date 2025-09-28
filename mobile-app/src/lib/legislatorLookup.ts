const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]/g;

const sanitize = (value?: string | number | null) => {
  if (value === null || value === undefined) return "";
  return String(value).toLowerCase().replace(NON_ALPHANUMERIC_REGEX, "");
};

export const normalizeChamberForLookup = (value?: string | null) => {
  const normalized = (value ?? "").toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("upper") || normalized.includes("senate")) return "upper";
  if (
    normalized.includes("lower") ||
    normalized.includes("house") ||
    normalized.includes("assembly")
  ) {
    return "lower";
  }
  return normalized.replace(NON_ALPHANUMERIC_REGEX, "");
};

export const createLegislatorLookupKey = (
  name?: string | null,
  chamber?: string | null,
  district?: string | number | null,
) => {
  const safeName = sanitize(name);
  const safeDistrict = sanitize(district);
  const safeChamber = normalizeChamberForLookup(chamber);
  return `${safeName}::${safeChamber}::${safeDistrict}`;
};
