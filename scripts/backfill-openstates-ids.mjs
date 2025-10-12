#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadEnvFile() {
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
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch (err) {
    console.warn('Warning: unable to load supabase/.env:', err.message);
  }
}

await loadEnvFile();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENSTATES_API_KEY = process.env.PUBLIC_OPENSTATES_API_KEY || process.env.OPENSTATES_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENSTATES_API_KEY) {
  console.error('Missing required environment variables. Need SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and OPENSTATES_API_KEY.');
  process.exit(1);
}

const JURISDICTION_ID = 'ocd-jurisdiction/country:us/state:ca/government';
const PAGE_SIZE = 50;
const FETCH_DELAY_MS = 1500;
const MAX_RETRIES = 6;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeIdentifier(value = '') {
  return value.replace(/\s+/g, '').toUpperCase();
}

const PREFIX_OVERRIDES = new Map([
  ['AR', 'HR'],
]);

function formatIdentifier(billNumber = '') {
  const trimmed = billNumber.trim();
  if (!trimmed) return null;
  if (trimmed.includes(' ')) return trimmed.replace(/\s+/g, ' ').toUpperCase();
  const match = trimmed.match(/^(?<prefix>[A-Za-z]+)(?<digits>\d+.*)$/);
  if (match) {
    let { prefix, digits } = match.groups;
    const upperPrefix = prefix.toUpperCase();
    if (PREFIX_OVERRIDES.has(upperPrefix)) {
      prefix = PREFIX_OVERRIDES.get(upperPrefix);
    } else {
      prefix = upperPrefix;
    }
    return `${prefix} ${digits}`;
  }
  return trimmed.toUpperCase();
}

function extractSession(stateLink = '') {
  if (!stateLink) return null;
  try {
    const url = new URL(stateLink);
    const billId = url.searchParams.get('bill_id');
    if (!billId) return null;
    const match = billId.match(/^(\d{8})/);
    return match ? match[1] : null;
  } catch (err) {
    return null;
  }
}

async function fetchBills(offset = 0) {
  const params = new URLSearchParams({
    select: 'id,bill_number,state_link,openstates_bill_id',
    limit: String(PAGE_SIZE),
    offset: String(offset),
    'openstates_bill_id': 'is.null'
  });
  const url = `${SUPABASE_URL}/rest/v1/bills?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch bills (${res.status}): ${text}`);
  }
  return res.json();
}

async function openStatesRequest(body, attempt = 1) {
  const res = await fetch('https://openstates.org/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY': OPENSTATES_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429 && attempt < MAX_RETRIES) {
    const backoff = FETCH_DELAY_MS * attempt;
    console.warn(`OpenStates rate limited. Retrying in ${backoff}ms (attempt ${attempt}/${MAX_RETRIES}).`);
    await sleep(backoff);
    return openStatesRequest(body, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenStates query failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function searchOpenStates(session, billNumber) {
  const formattedIdentifier = formatIdentifier(billNumber);
  if (!formattedIdentifier) return null;

  const variables = {
    j: JURISDICTION_ID,
    s: session,
    q: formattedIdentifier,
  };
  const query = `query($j:String!,$s:String!,$q:String!){ bills(first:10,jurisdiction:$j,session:$s,searchQuery:$q){ edges { node { id identifier title legislativeSession { identifier name } } } } }`;

  const payload = await openStatesRequest({ query, variables });
  if (payload.errors?.length) {
    const message = payload.errors.map((err) => err.message).join('; ');
    throw new Error(`OpenStates error: ${message}`);
  }

  const edges = payload.data?.bills?.edges ?? [];
  if (!edges.length) return null;

  const normalizedTarget = normalizeIdentifier(formattedIdentifier);
  const matchNode = edges
    .map((edge) => edge?.node)
    .filter(Boolean)
    .find((node) => normalizeIdentifier(node.identifier) === normalizedTarget && node.legislativeSession?.identifier === session)
    || edges[0]?.node;

  return matchNode?.id ? { id: matchNode.id, identifier: matchNode.identifier } : null;
}

async function updateBillOpenStatesId(billId, openStatesId) {
  const url = `${SUPABASE_URL}/rest/v1/bills?id=eq.${billId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ openstates_bill_id: openStatesId }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed updating bill ${billId} (${res.status}): ${text}`);
  }
}

async function main() {
  let offset = 0;
  let processed = 0;
  let updated = 0;
  let skipped = 0;

  while (true) {
    const bills = await fetchBills(offset);
    if (!bills.length) break;

    for (const bill of bills) {
      processed += 1;
      const session = extractSession(bill.state_link);
      if (!session) {
        console.warn(`Skipping bill ${bill.id} (${bill.bill_number}) – no session found.`);
        skipped += 1;
        continue;
      }

      try {
        const match = await searchOpenStates(session, bill.bill_number);
        if (!match) {
          console.warn(`No OpenStates match for ${bill.id} (${bill.bill_number}) in session ${session}.`);
          skipped += 1;
          await sleep(FETCH_DELAY_MS);
          continue;
        }

        await updateBillOpenStatesId(bill.id, match.id);
        console.log(`Linked bill ${bill.id} (${bill.bill_number}) -> ${match.id}`);
        updated += 1;
        await sleep(FETCH_DELAY_MS);
      } catch (err) {
        console.error(`Error processing bill ${bill.id} (${bill.bill_number}): ${err.message}`);
        skipped += 1;
        await sleep(FETCH_DELAY_MS);
      }
    }

    if (bills.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`Done. Processed: ${processed}, Updated: ${updated}, Skipped: ${skipped}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
