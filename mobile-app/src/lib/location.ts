export const isUsZip = (value: string): boolean => /^\s*\d{5}(-\d{4})?\s*$/.test(value);

export const normalizeZip = (value: string): string => value.trim().slice(0, 5);
