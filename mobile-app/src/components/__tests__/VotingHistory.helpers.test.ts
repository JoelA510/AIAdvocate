jest.mock("@/lib/supabase", () => ({
  supabase: {},
}));

import { getBillOptions, getFilteredRows } from "../VotingHistory";

const sampleRows = [
  {
    vote_event_id: 1,
    vote_date: "2024-01-01T00:00:00Z",
    motion: "Do pass",
    vote_result: "passed",
    vote_choice: "yay",
    bill_id: 10,
    bill_number: "HB 10",
    bill_title: "Housing",
  },
  {
    vote_event_id: 2,
    vote_date: "2024-01-02T00:00:00Z",
    motion: "Adopt amendment",
    vote_result: "failed",
    vote_choice: "nay",
    bill_id: 11,
    bill_number: "HB 11",
    bill_title: "Education",
  },
  {
    vote_event_id: 3,
    vote_date: "2024-01-03T00:00:00Z",
    motion: "Refer to committee",
    vote_result: "in committee",
    vote_choice: "abstain",
    bill_id: 10,
    bill_number: "HB 10",
    bill_title: "Housing (duplicate)",
  },
  {
    vote_event_id: 4,
    vote_date: "2024-01-04T00:00:00Z",
    motion: "Table",
    vote_result: null,
    vote_choice: "other",
    bill_id: null,
    bill_number: null,
    bill_title: null,
  },
];

describe("VotingHistory helpers", () => {
  it("builds unique bill options", () => {
    const options = getBillOptions(sampleRows as any);
    expect(options).toHaveLength(2);
    expect(options).toEqual([
      { bill_id: 10, bill_number: "HB 10", bill_title: "Housing" },
      { bill_id: 11, bill_number: "HB 11", bill_title: "Education" },
    ]);
  });

  it("filters closed results", () => {
    const rows = getFilteredRows(sampleRows as any, "closed", null);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.vote_event_id)).toEqual([1, 2]);
  });

  it("filters to a specific bill when selected", () => {
    const rows = getFilteredRows(sampleRows as any, "specific", 11);
    expect(rows).toHaveLength(1);
    expect(rows[0].bill_id).toBe(11);
  });
});
