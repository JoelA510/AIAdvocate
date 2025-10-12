#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadEnv() {
  const envPath = path.resolve(__dirname, '..', 'supabase', '.env');
  try {
    const content = await fs.readFile(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex);
      if (process.env[key]) continue;
      let value = trimmed.slice(eqIndex + 1);
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      process.env[key] = value;
    }
  } catch (err) {
    console.warn('Warning: unable to read supabase/.env:', err.message);
  }
}

await loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const PAGE_SIZE = 1;
const SLEEP_MS = 2000;
const MAX_ATTEMPTS = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchBillIds() {
  const url = `${SUPABASE_URL}/rest/v1/bills?select=id&order=id.asc`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to load bill IDs (${res.status}): ${text}`);
  }
  const rows = await res.json();
  return rows.map((row) => row.id);
}

async function invokeBackfill(offset) {
  const query = new URLSearchParams({
    limit: String(PAGE_SIZE),
    page_size: String(PAGE_SIZE),
    offset: String(offset),
    force: 'true',
  });
  const url = `${SUPABASE_URL}/functions/v1/votes-backfill?${query.toString()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: '{}',
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Backfill request failed (${res.status}): ${text}`);
  }
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (err) {
    throw new Error(`Unable to parse backfill response: ${text}`);
  }
  return payload;
}

async function main() {
  const billIds = await fetchBillIds();
  console.log(`Backfilling votes for ${billIds.length} bills...`);

  for (let index = 0; index < billIds.length; index += 1) {
    const billId = billIds[index];
    let attempt = 0;
    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
      try {
        const result = await invokeBackfill(index);
        const errorCount = Array.isArray(result.errors) ? result.errors.length : 0;
        const message = `offset=${index} bill=${billId} events=${result.voteEventsUpserted ?? 0} records=${result.voteRecordsUpserted ?? 0} errors=${errorCount}`;
        if (errorCount) {
          console.warn(`Backfill completed with ${errorCount} errors for bill ${billId}:`, result.errors);
        } else {
          console.log(message);
        }
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Attempt ${attempt} failed for bill ${billId}: ${message}`);
        if (attempt >= MAX_ATTEMPTS) {
          console.error(`Giving up on bill ${billId} after ${attempt} attempts.`);
          break;
        }
        await sleep(SLEEP_MS * attempt);
      }
    }
    await sleep(SLEEP_MS);
  }

  console.log('Backfill loop complete.');
}

main().catch((err) => {
  console.error('Fatal error during votes backfill:', err);
  process.exit(1);
});
