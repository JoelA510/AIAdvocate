// mobile-app/src/lib/translation.ts
import { supabase } from "./supabase";

type TranslationRecord = {
  bill_id: number;
  language_code: string;
  title?: string | null;
  description?: string | null;
  summary_simple?: string | null;
  summary_medium?: string | null;
  summary_complex?: string | null;
  original_text?: string | null;
};

// Prefer a bulk Edge Function ("translate-bills") and fall back to single calls ("translate-bill")
export async function fetchTranslationsForBills(
  billIds: number[],
  language: string,
): Promise<Record<number, TranslationRecord>> {
  if (!billIds.length || language === "en") return {};

  // 1) Bulk function (recommended)
  try {
    const { data, error } = await supabase.functions.invoke("translate-bills", {
      body: { bill_ids: billIds, language_code: language },
    });
    if (!error && Array.isArray(data)) {
      const map: Record<number, TranslationRecord> = {};
      (data as TranslationRecord[]).forEach((r) => (map[r.bill_id] = r));
      return map;
    }
  } catch {
    // ignore and try fallback
  }

  // 2) Fallback: call single-bill function concurrently (in small batches)
  const out: Record<number, TranslationRecord> = {};
  const batch = 5;
  for (let i = 0; i < billIds.length; i += batch) {
    const slice = billIds.slice(i, i + batch);
    const results = await Promise.allSettled(
      slice.map((id) =>
        supabase.functions.invoke("translate-bill", {
          body: { bill_id: id, language_code: language },
        }),
      ),
    );
    results.forEach((res, idx) => {
      if (res.status === "fulfilled" && res.value?.data) {
        const id = slice[idx];
        out[id] = { bill_id: id, language_code: language, ...(res.value.data as any) };
      }
    });
  }
  return out;
}
