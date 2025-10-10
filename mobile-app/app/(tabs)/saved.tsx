import React, { useCallback, useMemo, useState } from "react";
import { StyleSheet, FlatList, View, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "react-native-paper";

import { ThemedView } from "../../components/ThemedView";
import BillComponent from "../../src/components/Bill";
import BillSkeleton from "../../src/components/BillSkeleton";
import EmptyState from "../../src/components/EmptyState";
import { supabase } from "../../src/lib/supabase";
import { useAuth } from "../../src/providers/AuthProvider";

export default function SavedBillsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const theme = useTheme();

  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const userId = session?.user?.id;

  const fetchBillsByIds = async (ids: (string | number)[]) => {
    if (!ids.length) return [] as any[];
    const { data, error } = await supabase.from("bills").select("*").in("id", ids);
    if (error) throw error;
    return data ?? [];
  };

  const load = useCallback(async () => {
    if (!userId) {
      setBills([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: marks, error } = await supabase
        .from("bookmarks")
        .select("bill_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;

      const ids = (marks ?? []).map((m) => m.bill_id);
      const data = await fetchBillsByIds(ids);

      // preserve order by mapping back to ids
      const map = new Map(data.map((b) => [String(b.id), b]));
      const ordered = ids.map((id) => map.get(String(id))).filter(Boolean);
      setBills(ordered as any[]);
    } catch {
      setBills([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load]),
  );

  React.useEffect(() => {
    if (!userId) return;
    // Realtime subscription (publication enabled in SQL)
    const ch = supabase
      .channel(`bookmarks_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookmarks", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, load]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <View style={{ gap: 12 }}>
          <BillSkeleton />
          <BillSkeleton />
          <BillSkeleton />
        </View>
      );
    }
    if (!bills.length) {
      return (
        <EmptyState
          icon="bookmark.fill"
          title={t("saved.emptyTitle", { defaultValue: "No saved bills yet" })}
          message={t("saved.emptySubtitle", {
            defaultValue: "Tap the bookmark icon on any bill to save it here.",
          })}
        />
      );
    }
    return (
      <FlatList
        data={bills}
        keyExtractor={(b) => String((b as any).id)}
        renderItem={({ item }) => <BillComponent bill={item} />}
        contentContainerStyle={{ paddingBottom: insets.bottom + 12 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    );
  }, [loading, bills, insets.bottom, refreshing, onRefresh, t]);

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 8, paddingHorizontal: 16 }]}>
      <Stack.Screen
        options={{ title: t("tabs.saved", { defaultValue: "Saved" }), headerShown: false }}
      />
      <View
        style={[
          styles.content,
          {
            backgroundColor: theme.colors.surfaceContainerHigh,
            borderColor: theme.colors.outlineVariant,
          },
        ]}
      >
        {content}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    flex: 1,
    marginTop: 12,
    borderRadius: 28,
    borderWidth: 1,
    padding: 16,
  },
});
