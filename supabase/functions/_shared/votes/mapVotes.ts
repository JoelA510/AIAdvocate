// supabase/functions/_shared/votes/mapVotes.ts
// Shared helpers for mapping provider vote options to canonical enums.

export type VoteChoice = "yay" | "nay" | "abstain" | "absent" | "excused" | "other";

export function mapProviderOptionToChoice(option: string | null | undefined): VoteChoice {
  const normalized = (option ?? "").toLowerCase().trim();

  if (["yes", "yea", "y", "aye", "yay"].includes(normalized)) return "yay";
  if (["no", "nay", "n"].includes(normalized)) return "nay";
  if (["abstain", "present", "present-not-voting", "pnv"].includes(normalized)) return "abstain";
  if (["absent", "not voting", "nv", "not_present"].includes(normalized)) return "absent";
  if (["excused", "paired"].includes(normalized)) return "excused";
  return "other";
}
