// mobile-app/src/lib/billColumns.ts
//
// The column list shared by every screen that renders a list of BillComponent
// cards: the home feed, the Active tab, and the Saved tab. It used to be
// copy-pasted into all three, so a change to one silently diverged from the
// others.
//
// `original_text` is deliberately absent. It holds the full text of the bill —
// by far the largest column on the row — and no card renders a character of it.
// Its only consumer is SummarySlider on `/bill/[id]`, which reads from that
// screen's own `select("*")` fetch. Requesting it here pulled the entire corpus
// of bill text over the wire on every feed load, every debounced search, and
// every Saved-tab refresh, only to be discarded.
//
// Anything added here is paid for once per bill in the list, so keep it to
// fields the card actually reads.
export const BILL_LIST_COLUMNS =
  "id, bill_number, title, description, status, status_text, status_date, state_link, is_curated, summary_simple, summary_medium, summary_complex, created_at, change_hash, progress, calendar, history, openstates_bill_id, panel_review";
