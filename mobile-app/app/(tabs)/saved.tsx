import React, { useMemo, useState } from "react";
import { StyleSheet, FlatList, View, RefreshControl } from "react-native";
import { useFocusEffect, Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "react-native-paper";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ThemedView } from "../../components/ThemedView";
import BillComponent from "../../src/components/Bill";
import BillSkeleton from "../../src/components/BillSkeleton";
import EmptyState from "../../src/components/EmptyState";
import { BILL_LIST_COLUMNS } from "../../src/lib/billColumns";
import { supabase } from "../../src/lib/supabase";
import { useAuth } from "../../src/providers/AuthProvider";

// Stable identity for the empty case so the `data = EMPTY_BILLS` default does
// not hand the FlatList a fresh array on every render.
const EMPTY_BILLS: any[] = [];

export default function SavedBillsScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const theme = useTheme();
  const colors = theme.colors as unknown as Record<string, string>;

  const [refreshing, setRefreshing] = useState(false);
  const userId = session?.user?.id;
  const queryClient = useQueryClient();

  const savedBillsKey = useMemo(() => ["savedBills", userId] as const, [userId]);

  const fetchBillsByIds = async (ids: (string | number)[]) => {
    if (!ids.length) return [] as any[];
    const { data, error } = await supabase.from("bills").select(BILL_LIST_COLUMNS).in("id", ids);
    if (error) throw error;
    return data ?? [];
  };

  const {
    data: bills = EMPTY_BILLS,
    isPending,
    isStale,
    refetch,
  } = useQuery({
    queryKey: savedBillsKey,
    enabled: Boolean(userId),
    // Bookmarks only change through this device's own actions or the realtime
    // channel below, both of which invalidate explicitly. Without a staleTime
    // the screen re-ran both queries on every single tab focus.
    staleTime: 5 * 60_000,
    queryFn: async () => {
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
      return ids.map((id) => map.get(String(id))).filter(Boolean) as any[];
    },
  });

  const loading = Boolean(userId) && isPending;

  // Refetch on focus only when the cache has actually gone stale. Tab switching
  // is frequent and bookmarks are not, so unconditionally reloading here was
  // two Supabase requests per visit for data that had not changed.
  useFocusEffect(
    React.useCallback(() => {
      if (isStale) refetch();
    }, [isStale, refetch]),
  );

  React.useEffect(() => {
    if (!userId) return;
    // Realtime subscription (publication enabled in SQL). Invalidating is
    // cheaper than refetching outright: an unmounted or background screen just
    // marks the entry stale and picks it up on next focus.
    const ch = supabase
      .channel(`bookmarks_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookmarks", filter: `user_id=eq.${userId}` },
        () => queryClient.invalidateQueries({ queryKey: savedBillsKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId, queryClient, savedBillsKey]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

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
        // See the note on the home feed: each card mount costs one RPC.
        initialNumToRender={6}
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    );
  }, [loading, bills, refreshing, onRefresh, t]);

  return (
    <ThemedView style={[styles.container, { paddingTop: 8, paddingHorizontal: 16 }]}>
      <Stack.Screen
        options={{ title: t("tabs.saved", { defaultValue: "Saved" }), headerShown: false }}
      />
      <View
        style={[
          styles.content,
          {
            backgroundColor: colors.surfaceContainerHigh ?? theme.colors.surface,
            borderColor: colors.outlineVariant ?? theme.colors.outline,
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
