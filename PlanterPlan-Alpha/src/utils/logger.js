const isDev = process.env.NODE_ENV !== 'production';

export function log(...args) {
  if (isDev) {
    console.log(...args);
  }
}

export function warn(...args) {
  if (isDev) {
    console.warn(...args);
  }
}

export function error(...args) {
  console.error(...args);
}
