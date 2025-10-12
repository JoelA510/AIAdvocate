// supabase/functions/_shared/votes/syncVotes.ts
// Utilities shared across vote ingestion jobs for syncing OpenStates vote data.

import { SupabaseClient } from "npm:@supabase/supabase-js@2";

import { mapProviderOptionToChoice } from "./mapVotes.ts";
import type { OpenStatesVoteEvent } from "../../votes-backfill/openstates.ts";

export type VoteSyncStats = {
  voteEventsProcessed: number;
  voteRecordsProcessed: number;
};

type BillContext = {
  id: number;
  bill_number?: string | null;
  title?: string | null;
};

type LegislatorRow = {
  id: number;
  provider_person_id: string;
};

export async function syncBillVoteEvents(
  supabase: SupabaseClient<any, "public", any>,
  bill: BillContext,
  events: OpenStatesVoteEvent[],
  nowIso = new Date().toISOString(),
): Promise<VoteSyncStats> {
  const payload = events
    .filter((event) => event?.id)
    .map((event) => ({
      provider: "openstates",
      provider_vote_event_id: event.id,
      bill_id: bill.id,
      motion: event.motion ?? null,
      result: event.result ?? null,
      chamber: normalizeChamber(event.organization?.classification ?? event.organization?.name ?? null),
      date: normalizeDate(event.startDate),
      updated_at: nowIso,
    }));

  if (!payload.length) {
    return { voteEventsProcessed: 0, voteRecordsProcessed: 0 };
  }

  const { data: upsertedEvents, error: eventError } = await supabase
    .from("vote_events")
    .upsert(payload, { onConflict: "provider,provider_vote_event_id" })
    .select("id,provider_vote_event_id");

  if (eventError) throw eventError;

  const idMap = new Map<string, number>();
  for (const row of upsertedEvents ?? []) {
    if (row?.provider_vote_event_id && typeof row.id === "number") {
      idMap.set(row.provider_vote_event_id, row.id);
    }
  }

  let totalVoteRecords = 0;

  for (const event of events) {
    if (!event?.id) continue;
    const voteEventId = idMap.get(event.id);
    if (!voteEventId) continue;

    const votes = Array.isArray(event.votes) ? event.votes.filter((entry) => entry?.voter?.id) : [];
    if (!votes.length) {
      await supabase.from("vote_records").delete().eq("vote_event_id", voteEventId);
      continue;
    }

    const legislatorMap = await ensureLegislators(supabase, votes, event, nowIso);

    const records = votes
      .map((vote) => {
        const providerId = vote?.voter?.id;
        if (!providerId) return null;
        const legislatorId = legislatorMap.get(providerId);
        if (!legislatorId) return null;
        return {
          vote_event_id: voteEventId,
          legislator_id: legislatorId,
          choice: mapProviderOptionToChoice(vote?.option),
          provider_option: vote?.option ?? null,
          updated_at: nowIso,
        };
      })
      .filter(Boolean) as Array<{
      vote_event_id: number;
      legislator_id: number;
      choice: string;
      provider_option: string | null;
      updated_at: string;
    }>;

    if (!records.length) {
      await supabase.from("vote_records").delete().eq("vote_event_id", voteEventId);
      continue;
    }

    const { error: recordError } = await supabase
      .from("vote_records")
      .upsert(records, { onConflict: "vote_event_id,legislator_id" });
    if (recordError) throw recordError;

    totalVoteRecords += records.length;

    const uniqueLegislatorIds = [...new Set(records.map((r) => r.legislator_id))];
    if (uniqueLegislatorIds.length) {
      const filterList = `(${uniqueLegislatorIds.join(",")})`;
      await supabase
        .from("vote_records")
        .delete()
        .eq("vote_event_id", voteEventId)
        .not("legislator_id", "in", filterList);
    }
  }

  return {
    voteEventsProcessed: idMap.size,
    voteRecordsProcessed: totalVoteRecords,
  };
}

async function ensureLegislators(
  supabase: SupabaseClient<any, "public", any>,
  votes: NonNullable<OpenStatesVoteEvent["votes"]>,
  event: OpenStatesVoteEvent,
  nowIso: string,
): Promise<Map<string, number>> {
  const chamber = normalizeChamber(event.organization?.classification ?? event.organization?.name ?? null);
  const seen = new Set<string>();
  const upsertPayload: Array<Record<string, unknown>> = [];

  for (const vote of votes ?? []) {
    const providerId = vote?.voter?.id;
    const name = vote?.voter?.name;
    if (!providerId || seen.has(providerId)) continue;
    seen.add(providerId);

    if (!name) continue;

    const payload: Record<string, unknown> = {
      provider: "openstates",
      provider_person_id: providerId,
      name,
      updated_at: nowIso,
    };

    if (chamber) payload.chamber = chamber;
    const lookupKey = buildLookupKey(name, chamber, null);
    if (lookupKey) payload.lookup_key = lookupKey;

    upsertPayload.push(payload);
  }

  if (upsertPayload.length) {
    const { error: legislatorError } = await supabase
      .from("legislators")
      .upsert(upsertPayload, { onConflict: "provider,provider_person_id" });
    if (legislatorError) {
      console.error("[votes-sync] Failed to upsert legislators", legislatorError);
      throw legislatorError;
    }
  }

  if (!seen.size) return new Map();

  const providerIds = Array.from(seen);
  const { data, error } = await supabase
    .from("legislators")
    .select("id,provider_person_id")
    .eq("provider", "openstates")
    .in("provider_person_id", providerIds);

  if (error) throw error;

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
