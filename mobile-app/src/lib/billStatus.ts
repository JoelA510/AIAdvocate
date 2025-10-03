export type BillLike = {
  status?: string | null;
  status_text?: string | null;
  status_date?: string | null;
  calendar?: any;
};

export type BillStatusDetails = {
  statusLabel: string | null;
  statusDate: string | null;
  nextEvent: {
    description: string;
    chamber?: string | null;
    location?: string | null;
    displayDate: string;
  } | null;
};

export const STATUS_LABELS: Record<string, string> = {
  "1": "Introduced",
  "2": "Engrossed",
  "3": "Enrolled",
  "4": "Passed",
  "5": "Vetoed",
  "6": "Failed",
};

type CalendarEntry = {
  date?: string;
  time?: string | null;
  description?: string | null;
  desc?: string | null;
  event?: string | null;
  type?: string | null;
  chamber?: string | null;
  location?: string | null;
};

const normalizeTime = (time?: string | null): string | null => {
  if (!time) return null;
  if (/^\d{4}$/.test(time)) {
    return `${time.slice(0, 2)}:${time.slice(2)}`;
  }
  if (/^\d{2}:\d{2}$/.test(time)) return time;
  return null;
};

const toEventDate = (entry: CalendarEntry): Date | null => {
  const datePart = entry?.date;
  if (!datePart) return null;
  const normalizedTime = normalizeTime(entry?.time);
  const iso = `${datePart}T${normalizedTime ?? "00:00"}`;
  const parsed = new Date(iso);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  const fallback = new Date(datePart);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

export const extractBillStatusDetails = (bill?: BillLike | null): BillStatusDetails => {
  if (!bill) {
    return { statusLabel: null, statusDate: null, nextEvent: null };
  }

  const statusLabel =
    bill.status_text ?? (bill.status ? (STATUS_LABELS[String(bill.status)] ?? null) : null);
  const statusDate = bill.status_date ?? null;

  let calendar: CalendarEntry[] = [];
  if (Array.isArray((bill as any)?.calendar)) {
    calendar = (bill as any).calendar as CalendarEntry[];
  } else if (bill?.calendar && typeof bill.calendar === "string") {
    try {
      const parsed = JSON.parse(bill.calendar);
      if (Array.isArray(parsed)) calendar = parsed as CalendarEntry[];
    } catch {
      calendar = [];
    }
  }

  const now = new Date();
  const upcoming = calendar
    .map((event) => ({ event, date: toEventDate(event) }))
    .filter((entry) => entry.date && !Number.isNaN(entry.date.getTime()))
    .map((entry) => ({ ...entry, ms: entry.date!.getTime() }))
    .filter((entry) => entry.ms >= now.getTime() - 60 * 60 * 1000)
    .sort((a, b) => a.ms - b.ms)[0];

  let nextEvent: BillStatusDetails["nextEvent"] = null;
  if (upcoming) {
    const { event, date } = upcoming;
    nextEvent = {
      description:
        event.description ?? event.desc ?? event.event ?? event.type ?? "Scheduled action",
      chamber: event.chamber ?? null,
      location: event.location ?? null,
      displayDate: date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }),
    };
  }

  return { statusLabel, statusDate, nextEvent };
};
