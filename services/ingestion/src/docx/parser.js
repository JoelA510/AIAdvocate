import { setHeaderField } from '../utils.js';

export function applyDocxHeaderValue(header, key, value) {
  const normalizedKey = String(key ?? '').trim().toLowerCase();
  setHeaderField(header, normalizedKey, value);
  return header;
}
