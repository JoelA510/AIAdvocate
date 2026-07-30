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

// The detail screen (`/bill/[id]`) needs everything a card needs plus the bill
// text, which SummarySlider renders under the "Original Text" level.
//
// It must NOT be `select("*")`. public.bills carries two columns no client code
// reads and that dominate the row:
//
//   - `embedding vector(1536)` — semantic-search input, used only by
//     get_related_bills server-side. PostgREST serialises it as a JSON array of
//     1536 floats, on the order of 15-20 KB per row, every single fetch.
//   - `original_text_formatted` — a second copy of the bill text. Nothing
//     renders it; SummarySlider reads `original_text`.
//
// Against a 5 GB/month egress allowance, a wildcard select here is one of the
// most expensive things the app can do per screen view.
export const BILL_DETAIL_COLUMNS = `${BILL_LIST_COLUMNS}, original_text`;
