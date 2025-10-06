import { extractBillStatusDetails, STATUS_LABELS } from "@/lib/billStatus";

describe("extractBillStatusDetails", () => {
  it("falls back to a canned status label when status_text is unavailable", () => {
    const result = extractBillStatusDetails({
      status: "1",
      status_text: null,
      status_date: "2024-01-05",
      calendar: null,
    });

    expect(result.statusLabel).toBe(STATUS_LABELS["1"]);
    expect(result.statusDate).toBe("2024-01-05");
    expect(result.nextEvent).toBeNull();
  });

  it("selects the soonest upcoming calendar event", () => {
    const now = new Date();
    const hourMs = 60 * 60 * 1000;
    const toDate = (value: Date) => value.toISOString().slice(0, 10);
    const toTime = (value: Date) => value.toISOString().slice(11, 16);

    const result = extractBillStatusDetails({
      status: null,
      status_text: null,
      status_date: null,
      calendar: [
        {
          date: toDate(new Date(now.getTime() - 24 * hourMs)),
          time: toTime(new Date(now.getTime() - 24 * hourMs)),
          description: "Past hearing",
        },
        {
          date: toDate(new Date(now.getTime() + 2 * hourMs)),
          time: toTime(new Date(now.getTime() + 2 * hourMs)),
          description: "Upcoming hearing",
        },
        {
          date: toDate(new Date(now.getTime() + 24 * hourMs)),
          time: toTime(new Date(now.getTime() + 24 * hourMs)),
          description: "Later hearing",
        },
      ],
    });

    expect(result.nextEvent).not.toBeNull();
    expect(result.nextEvent?.description).toBe("Upcoming hearing");
    expect(result.nextEvent?.displayDate).toEqual(expect.any(String));
  });
});
