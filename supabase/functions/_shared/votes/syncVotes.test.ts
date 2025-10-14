// supabase/functions/_shared/votes/syncVotes.test.ts
// Deno tests for vote ingestion helpers.

import { assertEquals } from "https://deno.land/std@0.223.0/assert/assert_equals.ts";

import { syncBillVoteEvents, type BillContext } from "./syncVotes.ts";
import type { OpenStatesBillVotes } from "../../../../src/lib/openstatesClient.ts";

const NOW = "2024-01-01T00:00:00.000Z";

class MockSupabaseClient {
  eventUpserts: Array<{ payload: any[]; options?: unknown }> = [];
  recordUpserts: Array<{ payload: any[]; options?: unknown }> = [];
  legislatorUpserts: any[] = [];
  deletes: Array<{ table: string; filters: unknown[] }> = [];
  legislatorIdMap = new Map<string, number>();
  nextEventId = 1;
  nextLegislatorId = 100;

  from(table: string) {
    if (table === "vote_events") {
      return this.voteEventsBuilder();
    }
    if (table === "vote_records") {
      return this.voteRecordsBuilder();
    }
    if (table === "legislators") {
      return this.legislatorsBuilder();
    }
    throw new Error(`unexpected table ${table}`);
  }

  private voteEventsBuilder() {
    return {
      upsert: (payload: any[], options?: unknown) => {
        this.eventUpserts.push({ payload, options });
        const data = payload.map((row, idx) => ({
          id: this.nextEventId + idx,
          openstates_vote_event_id: row.openstates_vote_event_id,
        }));
        this.nextEventId += payload.length;
        return {
          select: async () => ({ data, error: null }),
        };
      },
    };
  }

  private voteRecordsBuilder() {
    const client = this;
    return {
      upsert: async (payload: any[], options?: unknown) => {
        client.recordUpserts.push({ payload, options });
        return { error: null };
      },
      delete() {
        const filters: unknown[] = [];
        const builder: any = {
          eq(column: string, value: unknown) {
            filters.push({ op: "eq", column, value });
            return builder;
          },
          not(column: string, operator: string, value: unknown) {
            filters.push({ op: "not", column, operator, value });
            client.deletes.push({ table: "vote_records", filters: [...filters] });
            return Promise.resolve({ error: null });
          },
          then(resolve: (value: unknown) => unknown) {
            client.deletes.push({ table: "vote_records", filters: [...filters] });
            return resolve({ error: null });
          },
          catch() {
            return builder;
          },
        };
        return builder;
      },
    };
  }

  private legislatorsBuilder() {
    const client = this;
    const builder: any = {
      upsert: async (payload: any[]) => {
        client.legislatorUpserts.push(payload);
        payload.forEach((row) => {
          client.assignLegislator(row.provider_person_id);
        });
        return { error: null };
      },
      select() {
        return builder;
      },
      eq() {
        return builder;
      },
      in(_column: string, values: string[]) {
        const data = values.map((value) => ({
          provider_person_id: value,
          id: client.assignLegislator(value),
        }));
        return Promise.resolve({ data, error: null });
      },
    };
    return builder;
  }

  private assignLegislator(id: string) {
    if (!this.legislatorIdMap.has(id)) {
      this.legislatorIdMap.set(id, this.nextLegislatorId++);
    }
    return this.legislatorIdMap.get(id)!;
  }
}

Deno.test("syncBillVoteEvents upserts vote events and records in bulk", async () => {
  const supabase = new MockSupabaseClient();
  const bill: BillContext = {
    id: 42,
    openstates_bill_id: "ocd-bill/42",
    bill_number: "HB 42",
    title: "Test Bill",
  };
  const bundle: OpenStatesBillVotes = {
    billId: "ocd-bill/42",
    billIdentifier: "HB 42",
    billTitle: "Test Bill",
    events: [
      {
        id: "vote-1",
        motionText: "Do pass",
        result: "passed",
        startDate: "2024-01-02T12:00:00Z",
        updatedAt: "2024-01-02T12:30:00Z",
        organization: { classification: "upper", name: "Senate" },
        votes: [
          { option: "yes", voter: { id: "person-1", name: "Jane Doe" } },
          { option: "no", voter: { id: "person-2", name: "John Roe" } },
        ],
        bill: { id: "ocd-bill/42", identifier: "HB 42" },
      },
    ],
  };

  const stats = await syncBillVoteEvents(supabase as unknown as any, bill, bundle, NOW);

  assertEquals(stats.voteEventsProcessed, 1);
  assertEquals(stats.voteRecordsProcessed, 2);
  assertEquals(supabase.eventUpserts.length, 1);
  assertEquals(supabase.recordUpserts.length, 1);

  const eventPayload = supabase.eventUpserts[0].payload[0];
  assertEquals(eventPayload.bill_id, 42);
  assertEquals(eventPayload.openstates_vote_event_id, "vote-1");

  const recordPayload = supabase.recordUpserts[0].payload;
  assertEquals(recordPayload.length, 2);
  assertEquals(
    recordPayload.map((row: any) => row.person_openstates_id).sort(),
    ["person-1", "person-2"],
  );
});

Deno.test("syncBillVoteEvents suppresses duplicate voter entries", async () => {
  const supabase = new MockSupabaseClient();
  const bill: BillContext = {
    id: 10,
    openstates_bill_id: "ocd-bill/10",
    bill_number: "SB 10",
    title: "Duplicate Test",
  };
  const bundle: OpenStatesBillVotes = {
    billId: "ocd-bill/10",
    billIdentifier: "SB 10",
    billTitle: "Duplicate Test",
    events: [
      {
        id: "vote-dup",
        motionText: "Adopt amendment",
        result: "passed",
        startDate: "2024-02-01T16:00:00Z",
        updatedAt: "2024-02-01T16:10:00Z",
        organization: { classification: "lower", name: "House" },
        votes: [
          { option: "yes", voter: { id: "person-9", name: "Alex Smith" } },
          { option: "yes", voter: { id: "person-9", name: "Alex Smith" } },
        ],
        bill: { id: "ocd-bill/10", identifier: "SB 10" },
      },
    ],
  };

  const stats = await syncBillVoteEvents(supabase as unknown as any, bill, bundle, NOW);

  assertEquals(stats.voteRecordsProcessed, 1);
  assertEquals(supabase.recordUpserts[0].payload.length, 1);
  assertEquals(supabase.deletes.length, 1);
  const deleteFilters = supabase.deletes[0].filters;
  assertEquals(deleteFilters[0], { op: "eq", column: "vote_event_id", value: 1 });
});
