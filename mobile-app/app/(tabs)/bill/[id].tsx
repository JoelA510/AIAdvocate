// mobile-app/app/(tabs)/bill/[id].tsx

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState, useEffect } from 'react';
import { StyleSheet, View, Pressable, ScrollView, ActivityIndicator, Share } from 'react-native';
import { Text, useTheme, Divider, Button, Card } from 'react-native-paper';

import { ThemedView } from '../../../components/ThemedView';
import { IconSymbol } from '../../../components/ui/IconSymbol';
import EmptyState from '../../../src/components/EmptyState';
import { supabase } from '../../../src/lib/supabase';
import ExpandableCard from '../../../src/components/ExpandableCard';

import type { Bill } from '../../../src/components/Bill';

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
    if (!bill) return;
    try {
      await Share.share({
        message: `Check out this bill: ${bill.bill_number} - ${bill.title}. You can learn more about it in the AI Advocate app.`,
        url: bill.state_link || undefined, // Share the official link if it exists
      });
    } catch (error) {
      console.error('Error sharing:', error);
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

        {/* --- Survivor Panel Review Card --- */}
        {/* **THE FIX:** Accessing the JSON object correctly */}
        {bill.panel_review && bill.panel_review.recommendation && (
          <Card style={[styles.reviewCard, { borderColor: theme.colors.primary }]} mode="outlined">
            <Card.Title title="Survivor Panel Review" titleVariant="titleMedium" />
            <Card.Content>
              <Text variant="labelLarge" style={styles.reviewRecommendation}>
                Recommendation: {bill.panel_review.recommendation}
              </Text>
              <Text variant="bodyMedium" style={styles.reviewComment}>
                {bill.panel_review.comment}
              </Text>
            </Card.Content>
          </Card>
        )}
        
        <Divider style={styles.divider} />

        <ExpandableCard title="Simple Summary" content={bill.summary_simple} />
        <ExpandableCard title="Medium Summary" content={bill.summary_medium} />
        <ExpandableCard title="Complex Summary" content={bill.summary_complex} />
        <ExpandableCard title="Original Text" content={bill.original_text} />
        
      </View>
    </ScrollView>
  );
}

// **THE FIX:** Pass the theme object to the StyleSheet function so it's available.
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
    borderWidth: 1,
  },
  reviewRecommendation: {
    fontWeight: "bold",
    marginBottom: 8,
  },
  reviewComment: {
    lineHeight: 22,
  },
});