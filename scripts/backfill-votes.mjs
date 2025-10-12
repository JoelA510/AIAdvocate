#!/usr/bin/env node
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadEnv() {
  const envPath = path.resolve(__dirname, "..", "supabase", ".env");
  try {
    const content = await fs.readFile(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq);
      if (process.env[key]) continue;
      let value = trimmed.slice(eq + 1);
      if (value.startsWith("\"") && value.endsWith("\"")) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch (err) {
    console.warn("Warning: unable to load supabase/.env:", err.message);
  }
}

await loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENSTATES_API_KEY = process.env.PUBLIC_OPENSTATES_API_KEY || process.env.OPENSTATES_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENSTATES_API_KEY) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENSTATES_API_KEY");
  process.exit(1);
}

const RATE_DELAY_MS = 1200;
const GRAPHQL_URL = "https://openstates.org/graphql";
const MAX_RETRIES = 6;
const force = process.argv.includes("--force");
const onlyBillId = process.argv.find((arg) => arg.startsWith("--bill="))?.split("=")[1] ?? null;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalize(input = "") {
  return input.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeChamber(value) {
  if (!value) return null;
  const lowered = value.toLowerCase();
  if (lowered.includes("upper") || lowered.includes("senate")) return "upper";
  if (lowered.includes("lower") || lowered.includes("house") || lowered.includes("assembly")) return "lower";
  return value;
}

function buildLookupKey(name, chamber, district) {
  const normalizedName = normalize(name);
  const normalizedChamber = normalizeChamber(chamber) ?? "";
  const normalizedDistrict = normalize(`${district ?? ""}`);
  if (!normalizedName) return null;
  return `${normalizedName}::${normalizedChamber}::${normalizedDistrict}`;
}

function mapProviderOptionToChoice(option) {
  const o = (option ?? "").toLowerCase();
  if (["yes", "yea", "y", "aye", "yay"].includes(o)) return "yay";
  if (["no", "nay", "n"].includes(o)) return "nay";
  if (["abstain", "present", "present-not-voting", "pnv"].includes(o)) return "abstain";
  if (["absent", "not voting", "nv", "not_present"].includes(o)) return "absent";
  if (["excused", "paired"].includes(o)) return "excused";
  return "other";
}

async function supabaseFetch(pathname, { method = "GET", headers = {}, body = undefined } = {}) {
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    method,
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...headers,
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase request failed (${res.status} ${res.statusText}): ${text}`);
  }
  return res;
}

function buildInFilter(values, { quote = true } = {}) {
  const escaped = values.map((value) => {
    if (quote) return `"${String(value).replace(/"/g, '""')}"`;
    return String(value);
  });
  return `(${escaped.join(",")})`;
}

async function fetchBills() {
  const params = new URLSearchParams({
    select: "id,openstates_bill_id,bill_number,state_link,vote_events(count)",
    order: "id.asc",
  });
  if (onlyBillId) {
    params.append("id", `eq.${onlyBillId}`);
  }
  const res = await supabaseFetch(`/rest/v1/bills?${params.toString()}`);
  const rows = await res.json();
  return rows.filter((row) => row.openstates_bill_id);
}

async function fetchBillVoteEvents(openstatesId) {
  const query = `
    query BillVoteEvents($id: String!) {
      bill(id: $id) {
        id
        votes(first: 200) {
          edges {
            node {
              id
              motionText
              result
              startDate
              updatedAt
              organization { classification name }
              votes {
                option
                voter { id name }
              }
            }
          }
        }
      }
    }
  `;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": OPENSTATES_API_KEY,
      },
      body: JSON.stringify({ query, variables: { id: openstatesId } }),
    });
    if (res.status === 429) {
      const delay = RATE_DELAY_MS * attempt;
      console.warn(`Rate limited by OpenStates. Retrying in ${delay}ms (attempt ${attempt}/${MAX_RETRIES}).`);
      await sleep(delay);
      continue;
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenStates request failed (${res.status}): ${text}`);
    }
    const payload = await res.json();
    if (payload.errors?.length) {
      const message = payload.errors.map((err) => err.message).join("; ");
      throw new Error(`OpenStates error: ${message}`);
    }
    const edges = payload.data?.bill?.votes?.edges ?? [];
    return edges.map((edge) => edge?.node).filter((node) => node?.id);
  }
  throw new Error("Exceeded retry budget for OpenStates vote query.");
}

async function ensureLegislators(votes, event) {
  const nowIso = new Date().toISOString();
  const chamber = normalizeChamber(event.organization?.classification ?? event.organization?.name ?? null);
  const payload = [];
  const providerIds = new Set();

  for (const vote of votes ?? []) {
    const providerId = vote?.voter?.id;
    const name = vote?.voter?.name;
    if (!providerId || !name || providerIds.has(providerId)) continue;
    providerIds.add(providerId);
    const lookupKey = buildLookupKey(name, chamber, null);
    payload.push({
      provider: "openstates",
      provider_person_id: providerId,
      name,
      lookup_key: lookupKey,
      updated_at: nowIso,
    });
  }

  if (payload.length) {
    await supabaseFetch("/rest/v1/legislators?on_conflict=provider,provider_person_id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(payload),
    });
  }

  if (!providerIds.size) return new Map();

  const search = new URLSearchParams({
    select: "id,provider_person_id",
    provider: "eq.openstates",
    provider_person_id: `in.${buildInFilter(Array.from(providerIds), { quote: true })}`,
  });
  const res = await supabaseFetch(`/rest/v1/legislators?${search.toString()}`);
  const rows = await res.json();
  const map = new Map();
  for (const row of rows) {
    if (row?.provider_person_id && typeof row.id === "number") {
      map.set(row.provider_person_id, row.id);
    }
  }
  return map;
}

async function upsertVoteEvents(billId, events) {
  if (!events.length) return new Map();
  const nowIso = new Date().toISOString();
  const rows = events.map((event) => ({
    provider: "openstates",
    provider_vote_event_id: event.id,
    bill_id: billId,
    motion: event.motionText ?? null,
    result: event.result ?? null,
    chamber: normalizeChamber(event.organization?.classification ?? event.organization?.name ?? null),
    date: event.startDate ? new Date(event.startDate).toISOString() : null,
    updated_at: nowIso,
  }));

  await supabaseFetch("/rest/v1/vote_events?on_conflict=provider,provider_vote_event_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });

  const params = new URLSearchParams({
    select: "id,provider_vote_event_id",
    provider: "eq.openstates",
    provider_vote_event_id: `in.${buildInFilter(events.map((event) => event.id), { quote: true })}`,
  });
  const res = await supabaseFetch(`/rest/v1/vote_events?${params.toString()}`);
  const data = await res.json();
  const map = new Map();
  for (const row of data) {
    if (row?.provider_vote_event_id && typeof row.id === "number") {
      map.set(row.provider_vote_event_id, row.id);
    }
  }
  return map;
}

async function upsertVoteRecords(voteEventId, votes, legislatorMap) {
  if (!votes.length) {
    await supabaseFetch(`/rest/v1/vote_records?vote_event_id=eq.${voteEventId}`, { method: "DELETE" });
    return;
  }

  const nowIso = new Date().toISOString();
  const rows = votes
    .map((vote) => {
      const providerId = vote?.voter?.id;
      if (!providerId) return null;
      const legislatorId = legislatorMap.get(providerId);
      if (!legislatorId) return null;
      return {
        vote_event_id: voteEventId,
        legislator_id: legislatorId,
        choice: mapProviderOptionToChoice(vote.option),
        provider_option: vote.option ?? null,
        updated_at: nowIso,
      };
    })
    .filter(Boolean);

  if (!rows.length) return;

  await supabaseFetch("/rest/v1/vote_records?on_conflict=vote_event_id,legislator_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(rows),
  });

  const legislatorIds = rows.map((row) => row.legislator_id);
  if (legislatorIds.length) {
    await supabaseFetch(`/rest/v1/vote_records?vote_event_id=eq.${voteEventId}&legislator_id=not.in.${buildInFilter(legislatorIds, { quote: false })}`, {
      method: "DELETE",
    });
  }
}

async function processBill(bill) {
  if (!bill.openstates_bill_id) return { events: 0, records: 0 };
  const existingCount = bill.vote_events?.[0]?.count ?? 0;
  if (!force && existingCount > 0) {
    return { events: 0, records: 0, skipped: true };
  }

  const events = await fetchBillVoteEvents(bill.openstates_bill_id);
  if (!events.length) {
    return { events: 0, records: 0 };
  }

  const eventIdMap = await upsertVoteEvents(bill.id, events);
  let totalRecords = 0;

  for (const event of events) {
    const voteEventId = eventIdMap.get(event.id);
    if (!voteEventId) continue;
    const legislatorMap = await ensureLegislators(event.votes, event);
    await upsertVoteRecords(voteEventId, event.votes ?? [], legislatorMap);
    totalRecords += event.votes?.length ?? 0;
  }

  return { events: events.length, records: totalRecords };
}

async function main() {
  const bills = await fetchBills();
  if (!bills.length) {
    console.log("No bills to process.");
    return;
  }

  console.log(`Processing ${bills.length} bills...`);
  let processed = 0;
  let totalEvents = 0;
  let totalRecords = 0;
  let skipped = 0;

  for (const bill of bills) {
    processed += 1;
    try {
      const result = await processBill(bill);
      if (result.skipped) {
        skipped += 1;
      } else {
        totalEvents += result.events ?? 0;
        totalRecords += result.records ?? 0;
        console.log(`Bill ${bill.bill_number ?? bill.id}: ${result.events ?? 0} events, ${result.records ?? 0} records.`);
      }
    } catch (err) {
      console.error(`Failed processing bill ${bill.bill_number ?? bill.id}:`, err.message);
    }
    await sleep(RATE_DELAY_MS);
  }

  console.log(`Done. Processed ${processed} bills (${skipped} skipped). Vote events upserted: ${totalEvents}. Vote records upserted: ${totalRecords}.`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
