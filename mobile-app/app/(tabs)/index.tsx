import { useState, useEffect } from "react";
import { StyleSheet, FlatList, TextInput, View } from "react-native";

import BillComponent, { Bill } from "@/components/Bill";
import BillSkeleton from "@/components/BillSkeleton";
import EmptyState from "@/components/EmptyState";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { supabase } from "@/lib/supabase";

export default function HomeScreen() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    // Reset state and show loading skeletons on new search
    setLoading(true);
    const fetchBills = async () => {
      try {
        let query = supabase
          .from("bills")
          .select("*")
          .order("id", { ascending: false });

        if (searchQuery.trim()) {
          // Use textSearch for searching
          query = query.textSearch("title,bill_number", searchQuery, {
            type: "websearch",
          });
        }

        const { data, error } = await query;

        if (error) {
          throw error;
        }
        setBills(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    // Debounce the search query to avoid excessive API calls
    const searchTimeout = setTimeout(() => {
      fetchBills();
    }, 300); // 300ms delay

    return () => clearTimeout(searchTimeout);
  }, [searchQuery]);

  const renderContent = () => {
    if (loading) {
      // Show 5 skeleton placeholders while loading
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
          message={`We couldn't fetch the bills. Please try again later. \n(${error})`}
        />
      );
    }

    if (bills.length === 0) {
      return (
        <EmptyState
          icon="paperplane.fill"
          title="No Bills Found"
          message={
            searchQuery
              ? `We couldn't find any bills matching "${searchQuery}". Try another search.`
              : "There are no bills to display at the moment."
          }
        />
      );
    }

    return (
      <FlatList
        data={bills}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <BillComponent bill={item} />}
        contentContainerStyle={{ paddingBottom: 40 }} // Add padding for tab bar
      />
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Explore Bills</ThemedText>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by keyword or bill number..."
          placeholderTextColor="#888"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
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
  searchInput: {
    height: 40,
    backgroundColor: "#f0f0f0",
    marginTop: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    fontSize: 16,
  },
});