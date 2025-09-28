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

  const map: Record<number, TranslationRecord> = {};
  const normalizedIds = Array.from(
    new Set(billIds.map((id) => Number(id)).filter((id) => !Number.isNaN(id))),
  );

  // 1) Pull any cached translations directly from Supabase first
  try {
    const { data: cached, error: cachedError } = await supabase
      .from("bill_translations")
      .select(
        "bill_id, language_code, title, description, summary_simple, summary_medium, summary_complex, original_text",
      )
      .eq("language_code", language)
      .in("bill_id", normalizedIds);

    if (!cachedError && Array.isArray(cached)) {
      cached.forEach((record) => {
        if (record?.bill_id != null) {
          map[Number(record.bill_id)] = record;
        }
      });
    }
  } catch {
    // Soft fail; we'll fall back to edge function below.
  }

  const missing = normalizedIds.filter((id) => !map[id]);

  if (!missing.length) {
    return map;
  }

  // 2) Ask the bulk translation edge function for any gaps.
  try {
    const { data, error } = await supabase.functions.invoke("translate-bills", {
      body: { bill_ids: missing, language_code: language },
    });
    if (!error && Array.isArray(data)) {
      (data as TranslationRecord[]).forEach((record) => {
        if (record?.bill_id != null) {
          map[Number(record.bill_id)] = record;
        }
      });
      return map;
    }
  } catch {
    // ignore and try fallback
  }

  // 2) Fallback: call single-bill function concurrently (in small batches)
  const batch = 5;
  for (let i = 0; i < missing.length; i += batch) {
    const slice = missing.slice(i, i + batch);
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
        map[id] = { bill_id: id, language_code: language, ...(res.value.data as any) };
      }
    });
  }
  return map;
}
