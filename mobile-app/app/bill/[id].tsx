// mobile-app/app/bill/[id].tsx

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { StyleSheet, View, Pressable, ScrollView, ActivityIndicator, Share } from 'react-native';
import { Text, useTheme, Divider, Button, Card } from 'react-native-paper';

import { ThemedView } from '../../components/ThemedView';
import { IconSymbol } from '../../components/ui/IconSymbol';
import EmptyState from '../../src/components/EmptyState';
import { supabase } from '../../src/lib/supabase';
import ExpandableCard from '../../src/components/ExpandableCard'; // Import our new component

import type { Bill } from '../../src/components/Bill'; // We still need the Bill type

export default function BillDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const theme = useTheme();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const backButtonColor = theme.colors.onSurface;

  useEffect(() => {
    if (!id) return;
    const fetchBill = async () => {
      try {
        // Fetch all columns, including our new summaries and original_text
        const { data, error } = await supabase.from("bills").select("*").eq("id", id).single();
        if (error) throw error;
        setBill(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchBill();
  }, [id]);

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out this bill: https://aiadvocate.com/bill/${id}`,
      });
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) {
    return (
      <ThemedView style={styles.centeredContainer}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (error || !bill) {
    return (
      <View style={[styles.centeredContainer, { backgroundColor: theme.colors.background }]}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol name="chevron.right" color={backButtonColor} size={24} style={styles.backIcon} />
          <Text>Back</Text>
        </Pressable>
        <EmptyState
          icon="chevron.left.forwardslash.chevron.right"
          title={error ? "An Error Occurred" : "Bill Not Found"}
          message={error ? `Could not load the bill.\n(${error})` : `The bill with ID #${id} could not be found.`}
        />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.scrollView, { backgroundColor: theme.colors.background }]}>
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol name="chevron.right" color={backButtonColor} size={24} style={styles.backIcon} />
          <Text style={{ fontSize: 16 }}>Back</Text>
        </Pressable>
        
        <Text variant="headlineMedium" style={styles.title}>{bill.bill_number}</Text>
        <Text variant="titleLarge" style={styles.subtitle}>{bill.title}</Text>
        <Button onPress={handleShare}>Share</Button>
        
        <Divider style={styles.divider} />

        {/* Use our new component for each text block */}
        <ExpandableCard title="Simple Summary" content={bill.summary_simple} />
        <ExpandableCard title="Medium Summary" content={bill.summary_medium} />
        <ExpandableCard title="Complex Summary" content={bill.summary_complex} />
        <ExpandableCard title="Original Text" content={bill.original_text} />
        
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  centeredContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flex: 1, padding: 16, paddingBottom: 40 },
  backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, alignSelf: 'flex-start' },
  backIcon: { transform: [{ rotate: '180deg' }] },
  title: { fontWeight: 'bold' },
  subtitle: { marginBottom: 16 },
  divider: { marginVertical: 16 },
  reviewCard: {
    marginVertical: 8,
  },
  reviewRecommendation: {
    fontWeight: "bold",
    marginBottom: 8,
  },
  reviewComment: {
    lineHeight: 22,
  },
});