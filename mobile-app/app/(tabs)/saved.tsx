// mobile-app/app/(tabs)/saved.tsx

import { useFocusEffect } from "expo-router";
import React, { useState, useCallback } from "react";
import { StyleSheet, FlatList, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "../../components/ThemedText";
import { ThemedView } from "../../components/ThemedView";
import BillComponent, { Bill } from "../../src/components/Bill";
import BillSkeleton from "../../src/components/BillSkeleton";
import EmptyState from "../../src/components/EmptyState";
import { supabase } from "../../src/lib/supabase";
import { useAuth } from "../../src/providers/AuthProvider";

export default function SavedBillsScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [savedBills, setSavedBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  const fetchSavedBills = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      setError("User not authenticated.");
      return;
    }
    setLoading(true);
    try {
      const { data: bookmarks, error: bookmarkError } = await supabase
        .from("bookmarks")
        .select("bill_id")
        .eq("user_id", userId);
      if (bookmarkError) throw bookmarkError;
      const billIds = bookmarks.map((b) => b.bill_id);
      if (billIds.length === 0) {
        setSavedBills([]);
        setLoading(false); // Make sure to stop loading
        return;
      }
      const { data: bills, error: billsError } = await supabase
        .from("bills")
        .select("*")
        .in("id", billIds);
      if (billsError) throw billsError;
      setSavedBills(bills || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      fetchSavedBills();
    }, [fetchSavedBills]),
  );

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
          message={`We couldn't fetch your saved bills.\n(${error})`}
        />
      );
    }
    if (savedBills.length === 0) {
      return (
        <EmptyState
          icon="bookmark.fill"
          title="No Saved Bills"
          message="You haven't saved any bills yet. Tap the bookmark icon on a bill to save it here."
        />
      );
    }
    return (
      <FlatList
        data={savedBills}
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
        <ThemedText type="title">Saved Bills</ThemedText>
      </View>
      <View style={styles.content}>{renderContent()}</View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
});