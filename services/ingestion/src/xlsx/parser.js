import { setHeaderField } from '../utils.js';

export function assignXlsxHeaderField(header, key, value) {
  if (!key) {
    return header;
  }
  setHeaderField(header, key, value);
  return header;
}
