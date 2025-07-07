import { useFocusEffect } from "expo-router";
import React, { useState, useCallback } from "react";
import { StyleSheet, FlatList, View } from "react-native";

import BillComponent, { Bill } from "@/components/Bill";
import BillSkeleton from "@/components/BillSkeleton";
import EmptyState from "@/components/EmptyState";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

export default function SavedBillsScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [savedBills, setSavedBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setLoading(false);
        return;
      }

      const { data: bills, error: billsError } = await supabase
        .from("bills")
        .select("*")
        .in("id", billIds);

      if (billsError) throw billsError;

      setSavedBills(bills);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // useFocusEffect will re-run the fetch logic every time the screen comes into view.
  // This is crucial for when a user bookmarks a bill on another screen and then
  // navigates back to this one.
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
          message={`We couldn't fetch your saved bills. Please try again later. \n(${error})`}
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
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    );
  };

  return (
    <ThemedView style={styles.container}>
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
    padding: 16,
    paddingTop: 60, // Add safe area padding
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  content: {
    flex: 1,
    padding: 16,
  },
});