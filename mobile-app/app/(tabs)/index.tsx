import { useState, useEffect, useMemo } from "react";
import { StyleSheet, FlatList, View } from "react-native";
import { Searchbar } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import BillComponent from "../../src/components/Bill";
import BillSkeleton from "../../src/components/BillSkeleton";
import EmptyState from "../../src/components/EmptyState";
import { ThemedView } from "../../components/ThemedView";
import { supabase } from "../../src/lib/supabase";
import { fetchTranslationsForBills } from "../../src/lib/translation";

const sortBills = (items: any[] | null | undefined) => {
  const toTime = (value: any) => {
    if (!value) return 0;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  };

  return [...(items ?? [])].sort((a, b) => {
    const curatedDiff = Number(Boolean(b?.is_curated)) - Number(Boolean(a?.is_curated));
    if (curatedDiff !== 0) return curatedDiff;

    const bTime = toTime(b?.status_date ?? b?.created_at);
    const aTime = toTime(a?.status_date ?? a?.created_at);
    if (bTime !== aTime) return bTime - aTime;

    return (b?.id ?? 0) - (a?.id ?? 0);
  });
};

export default function BillsHomeScreen() {
  const { t, i18n } = useTranslation();
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const fetchBills = async () => {
      setLoading(true);
      try {
        const trimmed = searchQuery.trim();
        const billNumberRegex = /^[A-Za-z]{2,3}\s*\d+$/;
        let data: any[] = [];

        if (!trimmed) {
          const { data: d, error: e } = await supabase
            .from("bills")
            .select("*")
            .order("is_curated", { ascending: false })
            .order("status_date", { ascending: false })
            .order("id", { ascending: false });
          if (e) throw e;
          data = d ?? [];
        } else if (billNumberRegex.test(trimmed)) {
          const processed = trimmed.replace(/\s/g, "");
          const { data: d, error: e } = await supabase
            .from("bills")
            .select("*")
            .ilike("bill_number", `%${processed}%`)
            .order("is_curated", { ascending: false })
            .order("status_date", { ascending: false })
            .order("id", { ascending: false });
          if (e) throw e;
          data = d ?? [];
        } else {
          const { data: d, error: e } = await supabase.rpc("search_bills", { p_query: trimmed });
          if (e) throw e;
          data = d ?? [];
        }

        setBills(sortBills(data));
        setError(null);
      } catch (err: any) {
        setError(err.message);
        setBills([]);
      } finally {
        setLoading(false);
      }
    };

    const searchTimeout = setTimeout(fetchBills, 300);
    return () => clearTimeout(searchTimeout);
  }, [searchQuery]);

  // Stable list of visible IDs; avoids listing `bills` as a dependency.
  const ids = useMemo(() => bills.map((b) => b.id), [bills]);
  const idsKey = useMemo(() => ids.join(","), [ids]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (i18n.language === "en") return;
      if (!ids.length) return;

      try {
        const map = await fetchTranslationsForBills(ids, i18n.language);
        if (!alive || !Object.keys(map).length) return;

        setBills((prev) =>
          prev.map((b) => {
            const tr = map[b.id];
            if (!tr) return b;
            return {
              ...b,
              title: tr.title ?? b.title,
              description: tr.description ?? b.description,
              summary_simple_es: tr.summary_simple ?? (b as any).summary_simple_es,
              summary_medium_es: tr.summary_medium ?? (b as any).summary_medium_es,
              summary_complex_es: tr.summary_complex ?? (b as any).summary_complex_es,
              original_text_es: tr.original_text ?? (b as any).original_text_es,
            };
          }),
        );
      } catch {
        /* non-fatal */
      }
    })();

    return () => {
      alive = false;
    };
  }, [i18n.language, idsKey, ids]);

  const renderContent = () => {
    if (loading) {
      return (
        <FlatList
          data={Array.from({ length: 5 })}
          renderItem={() => <BillSkeleton />}
          keyExtractor={(_, index) => `skeleton-${index}`}
          scrollEnabled={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        />
      );
    }
    if (error) {
      return (
        <EmptyState
          icon="chevron.left.forwardslash.chevron.right"
          title={t("error.title", "An Error Occurred")}
          message={t(
            "home.error",
            `We couldn't fetch the bills. Please try again later. \n(${error})`,
          )}
        />
      );
    }
    if (bills.length === 0) {
      return (
        <EmptyState
          icon="file-search-outline"
          title={t("home.emptyTitle", "No Bills Found")}
          message={
            searchQuery
              ? t(
                  "home.emptyWithQuery",
                  `We couldn't find any bills matching "${searchQuery}". Try another search.`,
                )
              : t("home.emptyNoQuery", "There are no bills to display at the moment.")
          }
        />
      );
    }
    return (
      <FlatList
        data={bills}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <BillComponent bill={item} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      />
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <Searchbar
          placeholder={t("home.searchPlaceholder", "Search by keyword or bill...")}
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />
      </View>
      <View style={styles.content}>{renderContent()}</View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  searchbar: {},
  content: { flex: 1, paddingHorizontal: 16 },
});
