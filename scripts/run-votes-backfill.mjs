#!/usr/bin/env node
import { loadEnv } from './loadEnv.mjs';
import { supabaseAuthHeaders } from './supabaseHeaders.mjs';

await loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const PAGE_SIZE = 25;
const SLEEP_MS = 2000;
const MAX_ATTEMPTS = 5;
const MAX_NO_PROGRESS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function invokeBackfill(startBillId) {
  const query = new URLSearchParams({
    page_size: String(PAGE_SIZE),
    start_bill_id: String(startBillId),
    force: 'true',
  });
  const url = `${SUPABASE_URL}/functions/v1/votes-backfill?${query.toString()}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: supabaseAuthHeaders(SUPABASE_SERVICE_ROLE_KEY, { 'Content-Type': 'application/json' }),
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
  // The votes-backfill function force-processes up to ~30 bills per call,
  // ordered by ascending id and resuming after `start_bill_id`, then reports
  // the next cursor in `continuation`. Drive it with that cursor instead of
  // issuing one HTTP call per bill.
  let startBillId = 0;
  let totalProcessed = 0;
  let totalErrors = 0;
  let noProgressStreak = 0;
  let aborted = false;

  while (true) {
    let attempt = 0;
    let payload = null;
    while (attempt < MAX_ATTEMPTS) {
      attempt += 1;
      try {
        payload = await invokeBackfill(startBillId);
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`Attempt ${attempt} failed after bill ${startBillId}: ${message}`);
        if (attempt >= MAX_ATTEMPTS) {
          console.error(`Giving up after ${attempt} attempts past bill ${startBillId}.`);
          break;
        }
        await sleep(SLEEP_MS * attempt);
      }
    }
    if (!payload) {
      // Exhausted retries on a transport/5xx error; record it so the summary
      // doesn't report a clean run, then stop.
      totalErrors += 1;
      aborted = true;
      break;
    }

    const continuation = payload.continuation ?? {};
    // Prefer the function's authoritative count; payload.errors is a capped preview.
    const errorCount = payload.errorsCount ?? (Array.isArray(payload.errors) ? payload.errors.length : 0);
    totalProcessed += payload.processedBills ?? 0;
    totalErrors += errorCount;

    console.log(
      `start_after=${startBillId} processed=${payload.processedBills ?? 0} ` +
        `events=${payload.voteEventsUpserted ?? 0} records=${payload.voteRecordsUpserted ?? 0} ` +
        `errors=${errorCount} next=${continuation.next_bill_id ?? '?'} has_more=${continuation.has_more === true}`,
    );
    if (errorCount) {
      console.warn('Errors in this batch:', payload.errors);
    }

    if (!continuation.has_more) break;

    // Advance past the furthest bill the batch reached (last successful or the
    // one that failed) so a failing bill is attempted once then skipped rather
    // than looped on.
    const resumeAfter = Math.max(
      continuation.next_bill_id ?? 0,
      continuation.failed_bill_id ?? 0,
    );

    if (resumeAfter <= startBillId) {
      // No forward progress and no failed bill to skip past — usually the
      // function hit its runtime deadline mid-bill (e.g. a large vote set).
      // Retry the same cursor a bounded number of times before giving up,
      // rather than aborting the whole run on the first stall.
      noProgressStreak += 1;
      if (noProgressStreak >= MAX_NO_PROGRESS) {
        console.error(
          `No forward progress past bill ${startBillId} after ${noProgressStreak} attempts; stopping.`,
        );
        aborted = true;
        break;
      }
      console.warn(
        `No forward progress past bill ${startBillId} (attempt ${noProgressStreak}/${MAX_NO_PROGRESS}); retrying.`,
      );
      await sleep(SLEEP_MS);
      continue;
    }

    noProgressStreak = 0;
    startBillId = resumeAfter;
    await sleep(SLEEP_MS);
  }

  console.log(
    `Backfill loop ${aborted ? 'aborted' : 'complete'}. ` +
      `processedBills=${totalProcessed} errors=${totalErrors}`,
  );
}

main().catch((err) => {
  console.error('Fatal error during votes backfill:', err);
  process.exit(1);
});
