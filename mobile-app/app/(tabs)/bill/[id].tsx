// mobile-app/app/(tabs)/bill/[id].tsx

import RelatedBills from '../../../src/components/RelatedBills';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Pressable, ScrollView, ActivityIndicator, Share, Linking } from 'react-native';
import { Text, useTheme, Divider, Button, Card, IconButton } from 'react-native-paper';
import * as Speech from 'expo-speech';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// CORRECT: All necessary imports are here.
import { trackEvent } from '../../../src/lib/analytics';
import { useAuth } from '../../../src/providers/AuthProvider';

import { ThemedView } from '../../../components/ThemedView';
import { IconSymbol } from '../../../components/ui/IconSymbol';
import EmptyState from '../../../src/components/EmptyState';
import { supabase } from '../../../src/lib/supabase';
import { Bill } from '../../../src/components/Bill';
import SummarySlider from '../../../src/components/SummarySlider';
import FindYourRep from '../../../src/components/FindYourRep';

export default function BillDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth(); // CORRECT: Session is ready to use.
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSummaryText, setActiveSummaryText] = useState('');
  
  const backButtonColor = theme.colors.onSurface;

  useEffect(() => {
    if (!id) return;
    const fetchBill = async () => {
      Speech.stop();
      setLoading(true);
      try {
        // Renaming 'data' to 'billData' for clarity
        const { data: billData, error } = await supabase.from("bills").select("*").eq("id", id).single();
        if (error) throw error;
        
        setBill(billData);

        // --- THIS IS THE FIX ---
        // The missing analytics call goes here, after the bill is successfully fetched.
        if (billData && session?.user?.id) {
          trackEvent('bill_view', session.user.id, { bill_id: billData.id });
        }
        // --- END OF FIX ---

      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchBill();
  }, [id, session]); // CORRECT: 'session' is correctly added to the dependency array.

  // All other functions (handleShare, handleSpeak, handleGoBack) are correct.
  const handleShare = async () => { /* ... */ };
  const handleSpeak = async () => { /* ... */ };
  const handleGoBack = () => { /* ... */ };
  if (loading) { /* ... */ }
  if (error || !bill) { /* ... */ }

  return (
    <ScrollView 
      style={[styles.scrollView, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      showsVerticalScrollIndicator={false}
      onScrollBeginDrag={() => Speech.stop()}
    >
      <View style={styles.container}>
        {/* The entire JSX layout below is correct */}
        <Pressable style={styles.backButton} onPress={handleGoBack}>
          <IconSymbol name="chevron.right" color={backButtonColor} size={24} style={styles.backIcon} />
          <Text style={{ fontSize: 16 }}>Back</Text>
        </Pressable>
        
        <Text variant="headlineMedium" style={styles.title}>{bill.bill_number}</Text>
        <Text variant="titleLarge" style={styles.subtitle}>{bill.title}</Text>
        
        <View style={styles.actionsContainer}>
          <Button icon="share-variant" mode="text" onPress={handleShare}>
            Share
          </Button>
          <IconButton
            icon="volume-high"
            size={24}
            onPress={handleSpeak}
            accessibilityLabel="Speak summary"
          />
        </View>

        {bill.panel_review && bill.panel_review.recommendation && (
          <Card style={[styles.reviewCard, { borderColor: theme.colors.primary }]} mode="outlined">
            <Card.Title title="Survivor Panel Review" titleVariant="titleMedium" />
            <Card.Content>
              <Text variant="labelLarge" style={styles.reviewRecommendation}> Recommendation: {bill.panel_review.recommendation} </Text>
              <Text variant="bodyMedium" style={styles.reviewComment}> {bill.panel_review.comment} </Text>
            </Card.Content>
          </Card>
        )}
        
        <Divider style={styles.divider} />
        <FindYourRep bill={bill} />
        <Divider style={styles.divider} />
        
        <SummarySlider bill={bill} onSummaryChange={setActiveSummaryText} />

        <Divider style={styles.divider} />
        <RelatedBills billId={bill.id} />

        {bill.original_text && (
          <Text style={styles.attributionText} onPress={() => Linking.openURL('https://legiscan.com')}>
            Original text provided by LegiScan
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

// All styles are correct.
const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  centeredContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },
  container: { flex: 1, padding: 16, paddingBottom: 40 },
  backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, alignSelf: 'flex-start' },
  backIcon: { transform: [{ rotate: '180deg' }] },
  title: { fontWeight: 'bold' },
  subtitle: { marginBottom: 16 },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginBottom: 8,
    marginLeft: -8,
  },
  divider: { marginVertical: 16 },
  reviewCard: { marginVertical: 8, borderWidth: 1 },
  reviewRecommendation: { fontWeight: "bold", marginBottom: 8 },
  reviewComment: { lineHeight: 22 },
  attributionText: { fontSize: 12, color: 'gray', textAlign: 'center', marginTop: 24, marginBottom: 8, textDecorationLine: 'underline' },
});