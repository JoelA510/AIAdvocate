import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";

import {
  buildBillStatuses,
  parseAgendaTime,
  parseDatRows,
  statusCodeFor,
} from "./pubinfoStatus.ts";

// Row shapes copied from the real 2025-26 tables (2026-11-10).
const q = (v: string | null) => (v === null ? "NULL" : `\`${v}\``);

const billRow = (
  id: string,
  type: string,
  state: string,
  house: string | null,
  status: string | null,
) =>
  [
    q(id),
    q("20252026"),
    q("0"),
    q(type),
    "1568",
    q(state),
    "NULL",
    "NULL",
    "NULL",
    "NULL",
    q("20250AB156896AMD"),
    q("Y"),
    q("HS_INT"),
    "2026-10-15 16:14:13",
    q("CS72"),
    q("Committee"),
    q(house),
    q(status),
    "2026-02-12 00:00:00",
  ].join("\t");

const historyRow = (
  id: string,
  seq: number,
  date: string,
  action: string,
  location: string,
  end: string,
  actionStatus = "Applied",
) =>
  [
    q(id),
    String(119120800 + seq),
    `${date} 00:00:00`,
    q(action),
    q("LEG_ESI"),
    "2026-11-03 12:43:49",
    String(seq),
    q("6"),
    q(actionStatus),
    q(location),
    q("Committee"),
    q("CS58"),
    q(end),
  ].join("\t");

const AB = "202520260AB1568";

const tables = () => ({
  bill: [
    billRow(AB, "AB", "Amended Assembly", "Senate", "In Committee Process"),
    billRow("202520260AB9999", "AB", "Introduced", "Assembly", "Died"),
  ].join("\n"),
  history: [
    // Out of order on purpose: sorted by sequence.
    historyRow(
      AB,
      3,
      "2026-02-02",
      "Referred to Com. on  PUB. S.",
      "Assembly",
      "In Committee Process",
    ),
    historyRow(
      AB,
      1,
      "2026-01-12",
      "Read first time.  To print.",
      "Assembly",
      "Pending Referral",
    ),
    historyRow(
      AB,
      13,
      "2026-05-26",
      "Read third time. Passed. Ordered to the Senate. (Ayes 73. Noes  0. Page 5354.)",
      "Assembly",
      "Passed",
    ),
    historyRow(
      AB,
      14,
      "2026-05-27",
      "In Senate.  Read first time.  To Com. on RLS. for assignment.",
      "Senate",
      "Pending Referral",
    ),
    historyRow(
      AB,
      15,
      "2026-05-28",
      "Passed. (rescinded)",
      "Senate",
      "Passed",
      "Rescinded",
    ),
    historyRow(
      "202520260AB1",
      1,
      "2026-01-01",
      "Not tracked.",
      "Assembly",
      "Pending Referral",
    ),
  ].join("\n"),
  hearing: [
    [
      q(AB),
      q("CX"),
      "18",
      "2026-03-03 00:00:00",
      q("CX18"),
      q("committee_service"),
      "2026-02-24 14:23:05",
    ].join("\t"),
    [
      q(AB),
      q("CS"),
      "72",
      "2026-06-16 00:00:00",
      q("CS72"),
      q("committee_service"),
      "2026-06-11 14:35:21",
    ].join("\t"),
  ].join("\n"),
  location: [
    [
      q("20252026"),
      q("CX18"),
      q("B"),
      "NULL",
      q("Asm Public Safety"),
      q("Public Safety"),
    ].join("\t"),
    [
      q("20252026"),
      q("CS72"),
      q("B"),
      "NULL",
      q("Sen Public Safety"),
      q("Public Safety"),
    ].join("\t"),
  ].join("\n"),
  agenda: [
    [
      q("CX18"),
      q("Public Safety"),
      "2026-03-03 00:00:00",
      q("9 a.m."),
      q("State Capitol, Room 126"),
      "NULL",
      "NULL",
      "NULL",
      "NULL",
    ].join("\t"),
    [
      q("CS72"),
      q("Public Safety"),
      "2026-06-16 00:00:00",
      q("Upon adjournment of Session"),
      q("1021 O Street, Room 2200"),
      "NULL",
      "NULL",
      "NULL",
      "NULL",
    ].join("\t"),
  ].join("\n"),
});

Deno.test("parseDatRows unquotes values and maps NULL to null", () => {
  assertEquals(parseDatRows("`a`\tNULL\t7\r\n\n`b c`\t``\tx"), [
    ["a", null, "7"],
    ["b c", "", "x"],
  ]);
});

Deno.test("status codes follow LegiScan's numbering", () => {
  const code = (
    measureType: string,
    measureState: string,
    currentHouse: string | null,
    currentStatus: string | null,
  ) =>
    statusCodeFor({ measureType, measureState, currentHouse, currentStatus });
  assertEquals(
    code("AB", "Introduced", "Assembly", "In Committee Process"),
    "1",
  );
  assertEquals(
    code("AB", "Amended Assembly", "Senate", "In Committee Process"),
    "2",
  );
  assertEquals(code("SB", "Amended Senate", "Senate", "In Floor Process"), "1");
  assertEquals(
    code("SB", "Amended Senate", "Assembly", "In Floor Process"),
    "2",
  );
  assertEquals(code("SB", "Enrolled", "Senate", "In Floor Process"), "3");
  assertEquals(code("AB", "Chaptered", "Secretary of State", "Chaptered"), "4");
  assertEquals(code("AB", "Enrolled", "Assembly", "Vetoed"), "5");
  assertEquals(code("AB", "Introduced", "Assembly", "Died"), "6");
  assertEquals(
    code("AB", "Amended Assembly", "Assembly", "Failed Passage in Committee"),
    "6",
  );
  // A house resolution is adopted by one house: passed, not enrolled.
  assertEquals(code("SR", "Enrolled", "Senate", "Passed"), "4");
  // An unknown status degrades to an active bill.
  assertEquals(code("AB", "Introduced", "Assembly", "Something New"), "1");
});

Deno.test("builds history, progress, status date and hearings for tracked bills only", () => {
  const { statuses, unknownStatuses } = buildBillStatuses(
    tables(),
    new Set([AB, "202520260AB9999", "202520260SB404"]),
  );
  assertEquals(unknownStatuses, []);
  // SB404 is not in BILL_TBL; AB1 is not wanted.
  assertEquals([...statuses.keys()].sort(), [
    "202520260AB1568",
    "202520260AB9999",
  ]);

  const bill = statuses.get(AB)!;
  assertEquals(bill.status, "2");
  // The date it was engrossed, not the latest action (2026-05-27).
  assertEquals(bill.status_date, "2026-05-26");
  assertEquals(bill.history.map((h) => h.sequence), [1, 3, 13, 14]);
  assertEquals(bill.history[0], {
    date: "2026-01-12",
    action: "Read first time. To print.",
    chamber: "A",
    sequence: 1,
  });
  assertEquals(bill.progress, [
    { date: "2026-01-12", event: 1 },
    { date: "2026-02-02", event: 9 },
    { date: "2026-05-26", event: 2 },
  ]);
  assertEquals(bill.calendar, [
    {
      date: "2026-03-03",
      time: "09:00",
      type: "Hearing",
      description: "Assembly Public Safety Hearing",
      chamber: "A",
      location: "State Capitol, Room 126",
    },
    {
      // "Upon adjournment of Session" is not a clock time.
      date: "2026-06-16",
      type: "Hearing",
      description: "Senate Public Safety Hearing",
      chamber: "S",
      location: "1021 O Street, Room 2200",
    },
  ]);

  // No history rows: status still known, date left for the caller to keep.
  const died = statuses.get("202520260AB9999")!;
  assertEquals(died.status, "6");
  assertEquals(died.status_date, null);
  assertEquals(died.history, []);
  // The hearing table loaded and lists none for this bill.
  assertEquals(died.calendar, []);

  // Without a hearing table, "no hearings" is unknown, not empty.
  const { hearing: _hearing, ...withoutHearings } = tables();
  assertEquals(
    buildBillStatuses(withoutHearings, new Set([AB])).statuses.get(AB)!
      .calendar,
    null,
  );
});

Deno.test("a vetoed bill awaiting veto consideration stays vetoed", () => {
  const id = "202520260SB490";
  const { statuses } = buildBillStatuses({
    bill: billRow(id, "SB", "Enrolled", "Senate", "In Floor Process"),
    history: [
      historyRow(
        id,
        1,
        "2025-02-19",
        "Introduced.",
        "Senate",
        "Pending Referral",
      ),
      historyRow(
        id,
        30,
        "2026-09-12",
        "Enrolled and presented to the Governor.",
        "Governor",
        "Enrolled",
      ),
      historyRow(
        id,
        31,
        "2026-09-30",
        "Vetoed by the Governor.",
        "Governor",
        "Vetoed",
      ),
      historyRow(
        id,
        32,
        "2026-10-01",
        "In Senate.  Consideration of Governor's veto pending.",
        "Senate",
        "In Floor Process",
      ),
    ].join("\n"),
  }, new Set([id]));
  assertEquals(statuses.get(id)!.status, "5");
  assertEquals(statuses.get(id)!.status_date, "2026-09-30");
});

Deno.test("an unknown current_status is reported", () => {
  const { unknownStatuses } = buildBillStatuses({
    bill: billRow(AB, "AB", "Introduced", "Assembly", "Held at Desk"),
    history: "",
  }, new Set([AB]));
  assertEquals(unknownStatuses, ["Held at Desk"]);
});

Deno.test("parseAgendaTime handles the formats in COMMITTEE_AGENDA_TBL", () => {
  assertEquals(parseAgendaTime("9 a.m."), "09:00");
  assertEquals(parseAgendaTime("1:30 p.m."), "13:30");
  assertEquals(parseAgendaTime("09:00   AM"), "09:00");
  assertEquals(parseAgendaTime("12:00 PM"), "12:00");
  assertEquals(parseAgendaTime("12 a.m."), "00:00");
  assertEquals(parseAgendaTime("Upon Call of the Chair"), null);
  assertEquals(parseAgendaTime("     "), null);
  assertEquals(parseAgendaTime(null), null);
});
