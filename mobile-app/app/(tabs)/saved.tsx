import React, { useState, useEffect } from 'react';
import { StyleSheet, FlatList } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import BillComponent, { Bill } from '@/components/Bill';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

export default function SavedBillsScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [savedBills, setSavedBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      setError('User not authenticated.');
      return;
    }

    const fetchSavedBills = async () => {
      try {
        const { data: bookmarks, error: bookmarkError } = await supabase
          .from('bookmarks')
          .select('bill_id')
          .eq('user_id', userId);

        if (bookmarkError) {
          throw bookmarkError;
        }

        const billIds = bookmarks.map((b) => b.bill_id);

        if (billIds.length === 0) {
          setSavedBills([]);
          setLoading(false);
          return;
        }

        const { data: bills, error: billsError } = await supabase
          .from('bills')
          .select('*')
          .in('id', billIds);

        if (billsError) {
          throw billsError;
        }

        setSavedBills(bills);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchSavedBills();
  }, [userId]);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading saved bills...</ThemedText>
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

  if (savedBills.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>No saved bills yet.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={savedBills}
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
});
