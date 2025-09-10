// mobile-app/app/(tabs)/saved.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, FlatList, View, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, Stack } from "expo-router";
import { useTranslation } from "react-i18next";

import { ThemedView } from "../../components/ThemedView";
import BillComponent, { Bill } from "../../src/components/Bill";
import BillSkeleton from "../../src/components/BillSkeleton";
import EmptyState from "../../src/components/EmptyState";
import { supabase } from "../../src/lib/supabase";
import { useAuth } from "../../src/providers/AuthProvider";

type SavedRow = {
  created_at: string;
  bill?: Bill | null;
  bill_id?: string | number | null;
  bill_slug?: string | null;
  bill_number?: string | null;
};

export default function SavedBillsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();

  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const userId = session?.user?.id;

  const load = useCallback(async () => {
    if (!userId) {
      setBills([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // A) Try a joined select, e.g. select bill via FK (fast path)
      const { data: joined, error: jErr } = await supabase
        .from("saved_bills")
        .select("created_at, bill:bills(*)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (!jErr && joined && joined.length && joined[0]?.bill) {
        setBills((joined as any[]).map((r) => r.bill).filter(Boolean));
        return;
      }

      // B) Fallbacks: pull keys, fetch bills by id/slug/number, then preserve order
      const { data: savedRows, error: e1 } = await supabase
        .from("saved_bills")
        .select("created_at,bill_id,bill_slug,bill_number")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (e1) throw e1;

      const rows = (savedRows ?? []).filter(Boolean) as SavedRow[];
      if (!rows.length) {
        setBills([]);
        return;
      }

      const ids = rows.map((r) => r.bill_id).filter(Boolean) as (string | number)[];
      const slugs = rows.map((r) => r.bill_slug).filter(Boolean) as string[];
      const nums = rows.map((r) => r.bill_number).filter(Boolean) as string[];

      const map = new Map<string, Bill>();

      if (ids.length) {
        const { data, error } = await supabase.from("bills").select("*").in("id", ids);
        if (error) throw error;
        (data ?? []).forEach((b: any) => map.set(`id:${String(b.id)}`, b));
      }
      if (slugs.length) {
        const { data, error } = await supabase.from("bills").select("*").in("slug", slugs);
        if (error) throw error;
        (data ?? []).forEach((b: any) => map.set(`slug:${String(b.slug)}`, b));
      }
      if (nums.length) {
        const { data, error } = await supabase.from("bills").select("*").in("number", nums);
        if (error) throw error;
        (data ?? []).forEach((b: any) => map.set(`num:${String(b.number)}`, b));
      }

      const ordered: Bill[] = [];
      for (const r of rows) {
        const a = r.bill_id != null ? map.get(`id:${String(r.bill_id)}`) : undefined;
        const b = !a && r.bill_slug ? map.get(`slug:${r.bill_slug}`) : undefined;
        const c = !a && !b && r.bill_number ? map.get(`num:${r.bill_number}`) : undefined;
        const found = (a || b || c) as Bill | undefined;
        if (found) ordered.push(found);
      }

      setBills(ordered);
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

  // Realtime refresh on inserts/updates/deletes
  React.useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`saved_bills_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "saved_bills", filter: `user_id=eq.${userId}` },
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

  const renderItem = ({ item }: { item: Bill }) => <BillComponent bill={item} />;

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
          title={t("saved.emptyTitle", { defaultValue: "No saved bills yet" })}
          subtitle={t("saved.emptySubtitle", {
            defaultValue: "Tap the bookmark icon on any bill to save it here.",
          })}
        />
      );
    }
    return (
      <FlatList
        data={bills}
        keyExtractor={(b) => String((b as any).id ?? Math.random())}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
    );
  }, [loading, bills, insets.bottom, refreshing, onRefresh, t]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{ title: t("tabs.saved", { defaultValue: "Saved" }), headerShown: false }}
      />
      <View style={[styles.content, { paddingTop: insets.top }]}>{content}</View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 16 },
});
