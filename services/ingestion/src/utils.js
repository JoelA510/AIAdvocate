export function setHeaderField(header, key, value) {
  const k = String(key ?? '').trim().toLowerCase();
  if (!k) return;
  if (k === 'reference') {
    header.reference = String(value ?? '').trim();
    return;
  }
  if (Object.prototype.hasOwnProperty.call(header, k)) {
    header[k] = String(value ?? '').trim();
  }
}
