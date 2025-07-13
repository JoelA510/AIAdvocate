import { useState, useEffect } from "react";
import { StyleSheet, FlatList, View } from "react-native";
import { Searchbar } from "react-native-paper"; // Keep Searchbar

import BillComponent from "../../src/components/Bill";
import BillSkeleton from "../../src/components/BillSkeleton";
import EmptyState from "../../src/components/EmptyState";
import { ThemedView } from "../../components/ThemedView";
import { ThemedText } from "../../components/ThemedText"; // Use ThemedText again
import { supabase } from "../../src/lib/supabase";

export default function HomeScreen() {
  // ... (logic is unchanged)
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    setLoading(true);
    const fetchBills = async () => {
      try {
        let query = supabase
          .from("bills")
          .select("*")
          .order("id", { ascending: false });

        if (searchQuery.trim()) {
          query = query.textSearch("title,bill_number", searchQuery, {
            type: "websearch",
          });
        }

        const { data, error } = await query;
        if (error) throw error;
        setBills(data);
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
  }, [searchQuery]);

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
          message={`We couldn't fetch the bills. Please try again later. \n(${error})`}
        />
      );
    }
    if (bills.length === 0) {
      return (
        <EmptyState
          icon="file-search-outline"
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
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    );
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        {/* REVERTED to ThemedText */}
        <ThemedText type="title" style={styles.title}>
          Explore Bills
        </ThemedText>
        <Searchbar
          placeholder="Search by keyword or bill..."
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
  container: {
    flex: 1,
  },
  header: {
    padding: 16,
    paddingTop: 60,
  },
  title: {
    fontWeight: "bold",
    marginBottom: 16,
    fontSize: 32, // Manually set style
    lineHeight: 32,
  },
  searchbar: {},
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
});