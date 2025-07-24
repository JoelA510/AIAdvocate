import { useState, useEffect } from "react";
import { StyleSheet, FlatList, View } from "react-native";
import BillComponent from "../../src/components/Bill";
import BillSkeleton from "../../src/components/BillSkeleton";
import EmptyState from "../../src/components/EmptyState";
import { ThemedView } from "../../components/ThemedView";
import { ThemedText } from "../../components/ThemedText";
import { supabase } from "../../src/lib/supabase";

export default function HomeScreen() {
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchBills = async () => {
      setLoading(true);
      try {
        let query = supabase
          .from("bills")
          .select("*")
          .eq('is_curated', true)
          .order("id", { ascending: false });

        if (searchQuery.trim()) {
          query = query.textSearch("title,bill_number", searchQuery, { type: "websearch" });
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
    fetchBills();
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
          message="There are no curated bills at the moment. Check back later!"
        />
      );
    }

    return (
      <FlatList
        data={bills}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <BillComponent bill={item} />}
      />
    );
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedView style={styles.titleContainer}>
        <ThemedText type="title">Bills</ThemedText>
      </ThemedView>
      {renderContent()}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  titleContainer: {
    paddingBottom: 16,
  },
});
