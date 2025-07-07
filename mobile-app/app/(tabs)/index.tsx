import { useState, useEffect } from 'react';
import { StyleSheet, FlatList, TextInput } from 'react-native';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import BillComponent, { Bill } from '@/components/Bill';

export default function HomeScreen() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    const fetchBills = async () => {
      try {
        let query = supabase.from('bills').select('*');

        if (searchQuery) {
          query = query.textSearch('title,description', searchQuery);
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

    fetchBills();
  }, [searchQuery]);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading bills...</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Error: {error}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <TextInput
        style={styles.searchInput}
        placeholder="Search bills..."
        value={searchQuery}
        onChangeText={setSearchQuery}
      />
      <FlatList
        data={bills}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <BillComponent bill={item} />}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  searchInput: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 16,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
});
