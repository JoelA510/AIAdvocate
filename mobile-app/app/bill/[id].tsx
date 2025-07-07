import { useState, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Bill } from '@/components/Bill';

export default function BillDetailsScreen() {
  const { id } = useLocalSearchParams();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchBill = async () => {
      try {
        const { data, error } = await supabase
          .from('bills')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          throw error;
        }
        setBill(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBill();
  }, [id]);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Loading bill details...</ThemedText>
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

  if (!bill) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText>Bill not found.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">{bill.bill_number}</ThemedText>
      <ThemedText type="subtitle">{bill.title}</ThemedText>
      <View style={styles.summaryContainer}>
        <ThemedText type="defaultSemiBold">Simple Summary:</ThemedText>
        <ThemedText>{bill.summary_simple}</ThemedText>
      </View>
      <View style={styles.summaryContainer}>
        <ThemedText type="defaultSemiBold">Medium Summary:</ThemedText>
        <ThemedText>{bill.summary_medium}</ThemedText>
      </View>
      <View style={styles.summaryContainer}>
        <ThemedText type="defaultSemiBold">Complex Summary:</ThemedText>
        <ThemedText>{bill.summary_complex}</ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  summaryContainer: {
    marginTop: 16,
  },
});
