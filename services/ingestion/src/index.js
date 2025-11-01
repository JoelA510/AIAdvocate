import { MAX_INPUT_BYTES } from './constants.js';

export function ensureBuffer(input) {
  if (Buffer.isBuffer(input)) {
    return input;
  }
  if (typeof input === 'string') {
    return Buffer.from(input);
  }
  throw new TypeError('Expected input to be a Buffer or string');
}

export function validateBuffer(buffer) {
  if (buffer.length === 0) {
    throw new Error('Refusing to parse an empty buffer');
  }
  if (buffer.length > MAX_INPUT_BYTES) {
    throw new Error('Input file too large');
  }
  return buffer;
}

export function parse(buffer, parser) {
  const normalized = validateBuffer(ensureBuffer(buffer));
  if (typeof parser !== 'function') {
    throw new TypeError('Parser must be a function');
  }
  return parser(normalized);
}
