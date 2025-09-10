// mobile-app/app/(tabs)/index.tsx

import { useState, useEffect } from "react";
import { StyleSheet, FlatList, View } from "react-native";
import { Searchbar } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";

import BillComponent from "../../src/components/Bill";
import BillSkeleton from "../../src/components/BillSkeleton";
import EmptyState from "../../src/components/EmptyState";
import { ThemedView } from "../../components/ThemedView";
import { ThemedText } from "../../components/ThemedText";
import { supabase } from "../../src/lib/supabase";

export default function HomeScreen() {
  const { t } = useTranslation();
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const fetchBills = async () => {
      setLoading(true);
      try {
        let query = supabase.from("bills").select("*").order("id", { ascending: false });
        const trimmedQuery = searchQuery.trim();
        const billNumberRegex = /^[A-Za-z]{2,3}\s*\d+$/;

        if (trimmedQuery) {
          if (billNumberRegex.test(trimmedQuery)) {
            const processedBillNumber = trimmedQuery.replace(/\s/g, "");
            query = query.ilike("bill_number", `%${processedBillNumber}%`);
          } else {
            query = query.textSearch("title,description", trimmedQuery, { type: "websearch" });
          }
        }

        const { data, error } = await query;
        if (error) throw error;
        setBills(data || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    const searchTimeout = setTimeout(() => {
      fetchBills();
    }, 300);
    return () => clearTimeout(searchTimeout);
  }, [searchQuery]); // Option A: includes what the effect uses

  const renderContent = () => {
    if (loading) {
      return (
        <FlatList
          data={Array.from({ length: 5 })}
          renderItem={() => <BillSkeleton />}
          keyExtractor={(_, index) => `skeleton-${index}`}
          scrollEnabled={false}
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
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <ThemedText type="title" style={styles.title}>
          {t("tabs.explore.title", "Explore Bills")}
        </ThemedText>

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
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontWeight: "bold", marginBottom: 16, fontSize: 32, lineHeight: 32 },
  searchbar: {},
  content: { flex: 1, paddingHorizontal: 16 },
});
