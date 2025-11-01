export const DEFAULT_MAX_INPUT_BYTES = 104_857_600;

export const MAX_INPUT_BYTES = Number.parseInt(
  process.env.INGESTION_MAX_INPUT_BYTES ?? String(DEFAULT_MAX_INPUT_BYTES),
  10
);

if (Number.isNaN(MAX_INPUT_BYTES) || MAX_INPUT_BYTES <= 0) {
  throw new Error('INGESTION_MAX_INPUT_BYTES must be a positive integer');
}
