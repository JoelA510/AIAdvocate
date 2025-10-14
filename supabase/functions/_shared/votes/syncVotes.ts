// supabase/functions/_shared/votes/syncVotes.ts
// Shared helpers for normalizing and persisting OpenStates vote data.

import { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { mapProviderOptionToChoice, type VoteChoice } from "./mapVotes.ts";
import type { OpenStatesBillVotes, OpenStatesVoteEvent } from "../../../../src/lib/openstatesClient.ts";

export type VoteSyncStats = {
  voteEventsProcessed: number;
  voteRecordsProcessed: number;
};

export type BillContext = {
  id: number;
  openstates_bill_id: string;
  bill_number?: string | null;
  title?: string | null;
};

type LegislatorRow = {
  id: number;
  provider_person_id: string;
};

type PersonSeed = {
  name: string | null;
  chamber: string | null;
};

type VoteRecordInsert = {
  vote_event_id: number;
  legislator_id: number;
  person_openstates_id: string;
  choice: VoteChoice;
  provider_option: string | null;
  updated_at: string;
};

export async function syncBillVoteEvents(
  supabase: SupabaseClient<any, "public", any>,
  bill: BillContext,
  bundle: OpenStatesBillVotes,
  nowIso = new Date().toISOString(),
): Promise<VoteSyncStats> {
  const events = bundle.events.filter((event) => Boolean(event?.id));
  if (!events.length) {
    return { voteEventsProcessed: 0, voteRecordsProcessed: 0 };
  }

  const eventPayload = events.map((event) => ({
    provider: "openstates",
    provider_vote_event_id: event.id,
    openstates_vote_event_id: event.id,
    bill_id: bill.id,
    motion: event.motionText ?? null,
    result: event.result ?? null,
    chamber: normalizeChamber(event.organization?.classification ?? event.organization?.name ?? null),
    date: normalizeDate(event.startDate),
    updated_at: event.updatedAt ? normalizeDate(event.updatedAt) ?? nowIso : nowIso,
  }));

  const { data: upsertedEvents, error: eventError } = await supabase
    .from("vote_events")
    .upsert(eventPayload, { onConflict: "openstates_vote_event_id" })
    .select("id,openstates_vote_event_id");

  if (eventError) throw eventError;

  const idMap = new Map<string, number>();
  for (const row of upsertedEvents ?? []) {
    if (row?.openstates_vote_event_id && typeof row.id === "number") {
      idMap.set(row.openstates_vote_event_id, row.id);
    }
  }

  if (!idMap.size) {
    return { voteEventsProcessed: 0, voteRecordsProcessed: 0 };
  }

  const people = new Map<string, PersonSeed>();
  const eventVoteMap = new Map<string, { event: OpenStatesVoteEvent; voteEventId: number }>();

  for (const event of events) {
    const voteEventId = idMap.get(event.id);
    if (!voteEventId) continue;

    const chamber = normalizeChamber(event.organization?.classification ?? event.organization?.name ?? null);
    const votes = Array.isArray(event.votes) ? event.votes.filter((entry) => entry?.voter?.id) : [];

    for (const vote of votes) {
      const voterId = vote?.voter?.id;
      if (!voterId) continue;
      if (!people.has(voterId)) {
        people.set(voterId, { name: vote?.voter?.name ?? null, chamber });
      }
    }

    eventVoteMap.set(event.id, { event, voteEventId });
  }

  const legislatorMap = await ensureLegislators(supabase, people, nowIso);

  const voteRecords: VoteRecordInsert[] = [];
  const perEventAllowed = new Map<number, Set<string>>();
  const emptyEvents: number[] = [];
  const recordKeys = new Set<string>();

  for (const [openstatesId, { event, voteEventId }] of eventVoteMap.entries()) {
    const votes = Array.isArray(event.votes) ? event.votes.filter((entry) => entry?.voter?.id) : [];
    if (!votes.length) {
      emptyEvents.push(voteEventId);
      continue;
    }

    const allowed = new Set<string>();

    for (const vote of votes) {
      const voterId = vote?.voter?.id;
      if (!voterId) continue;
      const legislatorId = legislatorMap.get(voterId);
      if (!legislatorId) continue;

      allowed.add(voterId);

      const recordKey = `${voteEventId}::${voterId}`;
      if (recordKeys.has(recordKey)) continue;
      recordKeys.add(recordKey);

      voteRecords.push({
        vote_event_id: voteEventId,
        legislator_id: legislatorId,
        person_openstates_id: voterId,
        choice: mapProviderOptionToChoice(vote?.option),
        provider_option: vote?.option ?? null,
        updated_at: nowIso,
      });
    }

    if (allowed.size === 0) {
      emptyEvents.push(voteEventId);
    } else {
      perEventAllowed.set(voteEventId, allowed);
    }
  }

  if (voteRecords.length) {
    const { error: recordsError } = await supabase
      .from("vote_records")
      .upsert(voteRecords, { onConflict: "vote_event_id,person_openstates_id" });
    if (recordsError) throw recordsError;
  }

  for (const eventId of emptyEvents) {
    await supabase.from("vote_records").delete().eq("vote_event_id", eventId);
  }

  for (const [eventId, allowed] of perEventAllowed.entries()) {
    const keep = Array.from(allowed);
    if (!keep.length) continue;
    await supabase
      .from("vote_records")
      .delete()
      .eq("vote_event_id", eventId)
      .not("person_openstates_id", "in", buildInFilter(keep));
  }

  return {
    voteEventsProcessed: idMap.size,
    voteRecordsProcessed: voteRecords.length,
  };
}

async function ensureLegislators(
  supabase: SupabaseClient<any, "public", any>,
  people: Map<string, PersonSeed>,
  nowIso: string,
): Promise<Map<string, number>> {
  if (!people.size) return new Map();

  const upsertPayload = Array.from(people.entries())
    .filter(([, seed]) => Boolean(seed.name))
    .map(([id, seed]) => {
      const lookupKey = buildLookupKey(seed.name, seed.chamber, null);
      return {
        provider: "openstates",
        provider_person_id: id,
        name: seed.name,
        lookup_key: lookupKey ?? undefined,
        updated_at: nowIso,
      };
    });

  if (upsertPayload.length) {
    const { error } = await supabase
      .from("legislators")
      .upsert(upsertPayload, { onConflict: "provider,provider_person_id" });
    if (error) throw error;
  }

  const providerIds = Array.from(people.keys());
  const { data, error: selectError } = await supabase
    .from("legislators")
    .select("id,provider_person_id")
    .eq("provider", "openstates")
    .in("provider_person_id", providerIds);

  if (selectError) throw selectError;

  const map = new Map<string, number>();
  for (const row of (data ?? []) as LegislatorRow[]) {
    if (row?.provider_person_id && typeof row.id === "number") {
      map.set(row.provider_person_id, row.id);
    }
  }

  return map;
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeChamber(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.includes("upper") || normalized.includes("senate")) return "upper";
  if (normalized.includes("lower") || normalized.includes("house") || normalized.includes("assembly")) {
    return "lower";
  }
  return value;
}

function buildLookupKey(
  name: string | null | undefined,
  chamber: string | null | undefined,
  district: string | null | undefined,
) {
  const norm = (input: string | null | undefined) =>
    (input ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const chamberNorm = (() => {
    const value = (chamber ?? "").toLowerCase();
    if (!value) return "";
    if (value.includes("upper") || value.includes("senate")) return "upper";
    if (value.includes("lower") || value.includes("house") || value.includes("assembly")) return "lower";
    return value.replace(/[^a-z0-9]/g, "");
  })();

  const districtNorm = norm(district);
  const base = norm(name);
  if (!base) return null;

  return `${base}::${chamberNorm}::${districtNorm}`;
}

function buildInFilter(values: string[]): string {
  const escaped = values.map((value) => `"${value.replace(/"/g, '""')}"`);
  return `(${escaped.join(",")})`;
}
