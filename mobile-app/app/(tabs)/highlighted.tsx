// mobile-app/app/(tabs)/highlighted.tsx

import { useState, useEffect } from "react";
import { StyleSheet, FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useTheme } from "react-native-paper";

import BillComponent from "../../src/components/Bill";
import BillSkeleton from "../../src/components/BillSkeleton";
import EmptyState from "../../src/components/EmptyState";
import { ThemedView } from "../../components/ThemedView";
import { ThemedText } from "../../components/ThemedText";
import { supabase } from "../../src/lib/supabase";

const OPEN_STATUS_CODES = ["1", "2", "3"];

const sortBills = (items: any[] | null | undefined) => {
  const toTime = (value: any) => {
    if (!value) return 0;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  };

  return [...(items ?? [])].sort((a, b) => {
    const bTime = toTime(b?.status_date ?? b?.created_at);
    const aTime = toTime(a?.status_date ?? a?.created_at);
    if (bTime !== aTime) return bTime - aTime;
    return (b?.id ?? 0) - (a?.id ?? 0);
  });
};

export default function HighlightedScreen() {
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  useEffect(() => {
    const fetchBills = async () => {
      setLoading(true);
      try {
        const openFilter = [
          ...OPEN_STATUS_CODES.map((code) => `status.eq.${code}`),
          "status.is.null",
        ].join(",");

        let query = supabase
          .from("bills")
          .select("*")
          .or(openFilter)
          .order("status_date", { ascending: false })
          .order("created_at", { ascending: false });

        const { data, error } = await query;
        if (error) throw error;
        setBills(sortBills(data));
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchBills();
  }, []);

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
          title="An Error Occurred"
          message={`We couldn't fetch the bills. \n(${error})`}
        />
      );
    }
    if (bills.length === 0) {
      return (
        <EmptyState
          icon="sparkles"
          title="No Highlighted Bills"
          message="There are no curated bills at the moment. Check back later!"
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
    <ThemedView style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.surfaceContainerHigh,
            borderColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <ThemedText type="title">{t("tabs.highlighted.title", "Highlighted Bills")}</ThemedText>
      </View>
      <View style={[styles.content, { paddingBottom: insets.bottom + 12 }]}>{renderContent()}</View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    marginHorizontal: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 24,
    borderWidth: 1,
    elevation: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
});
