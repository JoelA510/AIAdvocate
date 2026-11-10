// Bill status, history, progress and hearings from the Legislature's pubinfo
// tables, in the shapes the app already reads from LegiScan's getBill
// (mobile-app/src/lib/billStatus.ts, components/Bill.tsx).
//
// Table layouts are from pubinfo_load.zip (capublic.sql) and were checked
// against the 2025-26 data on 2026-11-10. Files are tab-separated, strings
// backtick-quoted, NULL for null. Column numbers below are 0-based.
//
//   BILL_TBL              0 bill_id, 3 measure_type, 5 measure_state,
//                         16 current_house, 17 current_status
//   BILL_HISTORY_TBL      0 bill_id, 2 action_date, 3 action, 6 action_sequence,
//                         8 action_status, 9 primary_location, 12 end_status
//   COMMITTEE_HEARING_TBL 0 bill_id, 3 hearing_date, 4 location_code
//   LOCATION_CODE_TBL     1 location_code, 4 description ("Asm Public Safety")
//   COMMITTEE_AGENDA_TBL  0 committee_code, 2 agenda_date, 3 agenda_time,
//                         4 line1 (room)

export const STATUS_TABLES = {
  bill: "BILL_TBL.dat",
  history: "BILL_HISTORY_TBL.dat",
  hearing: "COMMITTEE_HEARING_TBL.dat",
  location: "LOCATION_CODE_TBL.dat",
  agenda: "COMMITTEE_AGENDA_TBL.dat",
} as const;

export type HistoryEntry = {
  date: string;
  action: string;
  chamber: "A" | "S" | null;
  sequence: number;
};
export type ProgressEntry = { date: string; event: number };
export type CalendarEntry = {
  date: string;
  time?: string;
  type: "Hearing";
  description: string;
  chamber: "A" | "S" | null;
  location?: string;
};

export type PubinfoBillStatus = {
  // LegiScan status code: 1 Introduced, 2 Engrossed, 3 Enrolled, 4 Passed,
  // 5 Vetoed, 6 Failed.
  status: string;
  status_date: string | null;
  history: HistoryEntry[];
  progress: ProgressEntry[];
  // null when COMMITTEE_HEARING_TBL was missing or empty, so "no hearings"
  // cannot be told apart from "table unavailable"; [] means the table loaded
  // and lists none for this bill.
  calendar: CalendarEntry[] | null;
};

type Row = (string | null)[];

const parseDatLine = (line: string): Row =>
  line.split("\t").map((value) => {
    if (value === "NULL") return null;
    return value.length >= 2 && value.startsWith("`") && value.endsWith("`")
      ? value.slice(1, -1)
      : value;
  });

/**
 * Calls `onRow` for each row of a .dat file whose first column passes `keep`
 * (all rows when omitted). Lines are scanned in place and only kept rows are
 * split: BILL_HISTORY_TBL is 18 MB and ~89k rows, of which a few hundred
 * belong to tracked bills.
 */
export const forEachDatRow = (
  text: string,
  onRow: (row: Row) => void,
  keep?: (firstColumn: string) => boolean,
): void => {
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = text.length;
    let lineEnd = end;
    if (lineEnd > start && text.charCodeAt(lineEnd - 1) === 13) lineEnd -= 1;
    if (lineEnd > start) {
      if (keep) {
        let tab = text.indexOf("\t", start);
        if (tab === -1 || tab > lineEnd) tab = lineEnd;
        const quoted = text.charCodeAt(start) === 96 &&
          text.charCodeAt(tab - 1) === 96 && tab - start >= 2;
        const first = quoted
          ? text.slice(start + 1, tab - 1)
          : text.slice(start, tab);
        if (keep(first)) onRow(parseDatLine(text.slice(start, lineEnd)));
      } else {
        onRow(parseDatLine(text.slice(start, lineEnd)));
      }
    }
    start = end + 1;
  }
};

/** One .dat file as rows of unquoted values; `NULL` becomes null. */
export const parseDatRows = (text: string): Row[] => {
  const rows: Row[] = [];
  forEachDatRow(text, (row) => rows.push(row));
  return rows;
};

const isoDate = (value: string | null): string | null => {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value ?? "");
  return match ? match[1] : null;
};

const tidy = (value: string | null): string =>
  (value ?? "").replace(/\s+/g, " ").trim();

const chamberOf = (value: string | null): "A" | "S" | null =>
  value === "Assembly" ? "A" : value === "Senate" ? "S" : null;

const FAILED_STATUSES = new Set([
  "Died",
  "Failed",
  "Failed Passage in Committee",
]);

// Every current_status seen in 2025-26. Anything else maps like an active
// bill and is reported, so a new value is noticed rather than mislabeled
// silently.
export const KNOWN_CURRENT_STATUSES = new Set([
  "Chaptered",
  "In Committee Process",
  "Died",
  "Passed",
  "Vetoed",
  "In Floor Process",
  "Pending Referral",
  "Failed Passage in Committee",
  "Failed",
  "In Desk Process",
  "Enrolled",
  "Signed by Governor",
]);

const isHouseResolution = (measureType: string | null) =>
  measureType === "HR" || measureType === "SR";

export const statusCodeFor = (bill: {
  measureType: string | null;
  measureState: string | null;
  currentHouse: string | null;
  currentStatus: string | null;
}): string => {
  const { measureType, measureState, currentHouse, currentStatus } = bill;
  if (currentStatus === "Chaptered" || measureState === "Chaptered") return "4";
  if (currentStatus === "Vetoed") return "5";
  if (currentStatus !== null && FAILED_STATUSES.has(currentStatus)) return "6";
  // House resolutions (HR, SR) are adopted by one house and never chaptered.
  if (currentStatus === "Passed" && isHouseResolution(measureType)) return "4";
  if (measureState === "Enrolled" || currentStatus === "Enrolled") return "3";
  const origin = (measureType ?? "").startsWith("S") ? "Senate" : "Assembly";
  if (
    currentStatus === "Passed" ||
    ((currentHouse === "Assembly" || currentHouse === "Senate") &&
      currentHouse !== origin)
  ) {
    return "2";
  }
  return "1";
};

// LegiScan progress event ids: 1 Introduced, 2 Engrossed, 3 Enrolled,
// 4 Passed, 5 Vetoed, 6 Failed, 9 Refer, 10 Report Pass.
const progressFrom = (
  history: Array<HistoryEntry & { endStatus: string | null }>,
  passedEvent: 2 | 4,
): ProgressEntry[] => {
  const progress: ProgressEntry[] = [];
  const once = new Set<number>();
  const add = (date: string, event: number, repeatable = false) => {
    if (!repeatable && once.has(event)) return;
    const last = progress[progress.length - 1];
    if (last && last.date === date && last.event === event) return;
    once.add(event);
    progress.push({ date, event });
  };
  history.forEach((entry, i) => {
    if (i === 0) add(entry.date, 1);
    if (/^(re-)?referred to com/i.test(entry.action)) add(entry.date, 9, true);
    if (/^from committee\b.*\bdo pass/i.test(entry.action)) {
      add(entry.date, 10, true);
    }
    const end = entry.endStatus;
    if (end === "Passed") add(entry.date, passedEvent);
    else if (end === "Enrolled") add(entry.date, 3);
    else if (end === "Chaptered") add(entry.date, 4);
    else if (end === "Vetoed") add(entry.date, 5);
    else if (end !== null && FAILED_STATUSES.has(end)) add(entry.date, 6);
  });
  return progress;
};

/** "9 a.m.", "1:30 p.m.", "09:00   AM" -> "09:00", "13:30"; else null. */
export const parseAgendaTime = (value: string | null): string | null => {
  const match = /^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i.exec(
    tidy(value),
  );
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (match[3].toLowerCase() === "p" && hour !== 12) hour += 12;
  if (match[3].toLowerCase() === "a" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

const committeeName = (description: string): string =>
  description.replace(/^Asm\b/, "Assembly").replace(/^Sen\b/, "Senate");

export type StatusTables = {
  bill: string;
  history: string;
  hearing?: string;
  location?: string;
  agenda?: string;
};

/**
 * Status for each wanted bill id (e.g. "202520260AB1568") found in BILL_TBL.
 * `unknownStatuses` lists current_status values outside KNOWN_CURRENT_STATUSES.
 */
export const buildBillStatuses = (
  tables: StatusTables,
  wanted: ReadonlySet<string>,
): { statuses: Map<string, PubinfoBillStatus>; unknownStatuses: string[] } => {
  const unknown = new Set<string>();
  const bills = new Map<string, Row>();
  forEachDatRow(tables.bill, (row) => {
    if (row.length >= 18 && row[0] !== null) bills.set(row[0], row);
  }, (id) => wanted.has(id));

  const historyByBill = new Map<
    string,
    Array<HistoryEntry & { endStatus: string | null }>
  >();
  forEachDatRow(tables.history, (row) => {
    if (row.length < 13 || row[0] === null) return;
    // Rescinded and reconsidered actions did not stand.
    if (row[8] !== "Applied") return;
    const date = isoDate(row[2]);
    const action = tidy(row[3]);
    if (!date || !action) return;
    const list = historyByBill.get(row[0]) ?? [];
    list.push({
      date,
      action,
      chamber: chamberOf(row[9]),
      sequence: Number(row[6]) || 0,
      endStatus: row[12],
    });
    historyByBill.set(row[0], list);
  }, (id) => bills.has(id));

  const locations = new Map<string, string>();
  for (const row of parseDatRows(tables.location ?? "")) {
    if (row.length >= 5 && row[1] && row[4]) locations.set(row[1], row[4]);
  }
  const agendas = new Map<string, { time: string | null; room: string }>();
  for (const row of parseDatRows(tables.agenda ?? "")) {
    const date = isoDate(row[2] ?? null);
    if (row.length < 5 || !row[0] || !date) continue;
    agendas.set(`${row[0]}|${date}`, {
      time: parseAgendaTime(row[3]),
      room: tidy(row[4]),
    });
  }
  const hearingsLoaded = (tables.hearing ?? "").trim().length > 0;
  const hearingsByBill = new Map<string, Map<string, CalendarEntry>>();
  forEachDatRow(tables.hearing ?? "", (row) => {
    if (row.length < 5 || row[0] === null) return;
    const date = isoDate(row[3]);
    const code = row[4];
    if (!date || !code) return;
    const name = committeeName(locations.get(code) ?? "Committee");
    const agenda = agendas.get(`${code}|${date}`);
    const entry: CalendarEntry = {
      date,
      type: "Hearing",
      description: `${name} Hearing`,
      chamber: name.startsWith("Assembly")
        ? "A"
        : name.startsWith("Senate")
        ? "S"
        : null,
    };
    if (agenda?.time) entry.time = agenda.time;
    if (agenda?.room) entry.location = agenda.room;
    const byKey = hearingsByBill.get(row[0]) ?? new Map();
    byKey.set(`${date}|${code}`, entry);
    hearingsByBill.set(row[0], byKey);
  }, (id) => bills.has(id));

  const statuses = new Map<string, PubinfoBillStatus>();
  for (const [billId, row] of bills) {
    const currentStatus = row[17];
    if (currentStatus !== null && !KNOWN_CURRENT_STATUSES.has(currentStatus)) {
      unknown.add(currentStatus);
    }
    const entries = (historyByBill.get(billId) ?? []).sort((a, b) =>
      a.sequence - b.sequence || a.date.localeCompare(b.date)
    );
    const calendar = !hearingsLoaded
      ? null
      : Array.from(hearingsByBill.get(billId)?.values() ?? [])
        .sort((a, b) =>
          a.date.localeCompare(b.date) ||
          (a.time ?? "").localeCompare(b.time ?? "")
        );
    const progress = progressFrom(
      entries,
      isHouseResolution(row[3]) ? 4 : 2,
    );
    let status = statusCodeFor({
      measureType: row[3],
      measureState: row[5],
      currentHouse: row[16],
      currentStatus,
    });
    // A vetoed bill returns to its house as "Enrolled / In Floor Process"
    // while the veto is pending consideration; it is still vetoed.
    if (status === "3" && progress.some((p) => p.event === 5)) status = "5";
    // Like LegiScan: the date the bill reached its current status, falling
    // back to the latest action.
    const reached = progress.findLast((p) => p.event === Number(status));
    statuses.set(billId, {
      status,
      status_date: reached?.date ??
        (entries.length > 0
          ? entries.reduce((max, e) => (e.date > max ? e.date : max), "")
          : null),
      history: entries.map(({ date, action, chamber, sequence }) => ({
        date,
        action,
        chamber,
        sequence,
      })),
      progress,
      calendar,
    });
  }
  return { statuses, unknownStatuses: Array.from(unknown).sort() };
};
