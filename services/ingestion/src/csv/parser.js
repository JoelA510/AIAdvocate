import { setHeaderField } from '../utils.js';

export function parseCsvHeader(line, headerTemplate) {
  const header = { ...headerTemplate };
  const [rawKey, ...rest] = String(line ?? '').split(':');
  const normalizedKey = String(rawKey ?? '').trim().toLowerCase();
  const value = rest.join(':');
  setHeaderField(header, normalizedKey, value);
  return header;
}
