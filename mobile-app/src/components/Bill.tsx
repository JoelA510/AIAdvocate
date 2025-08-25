// mobile-app/app/(tabs)/bill/[id].tsx

import RelatedBills from '../../../src/components/RelatedBills';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Pressable, ScrollView, ActivityIndicator, Share, Linking } from 'react-native';
import { Text, useTheme, Divider, Button, Card, IconButton, ActivityIndicator as PaperActivityIndicator } from 'react-native-paper';
import * as Speech from 'expo-speech';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next'; // <-- NEW IMPORT

import { trackEvent } from '../../../src/lib/analytics';
import { useAuth } from '../../../src/providers/AuthProvider';
import { ThemedView } from '../../../components/ThemedView';
import { IconSymbol } from '../../../components/ui/IconSymbol';
import EmptyState from '../../../src/components/EmptyState';
import { supabase } from '../../../src/lib/supabase';
import { Bill } from '../../../src/components/Bill';
import SummarySlider from '../../../src/components/SummarySlider';
import FindYourRep from '../../../src/components/FindYourRep';

// Type for our translated content
type TranslatedBill = Omit<Bill, 'id' | 'bill_number'>;

export default function BillDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const { i18n } = useTranslation(); // <-- Get i18n instance
  const currentLanguage = i18n.language;
  
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  
  const [bill, setBill] = useState<Bill | null>(null);
  const [translatedBill, setTranslatedBill] = useState<TranslatedBill | null>(null); // <-- NEW STATE
  const [isTranslating, setIsTranslating] = useState(false); // <-- NEW STATE
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSummaryText, setActiveSummaryText] = useState('');
  
  const backButtonColor = theme.colors.onSurface;

  // Effect to fetch the original bill
  useEffect(() => {
    if (!id) return;
    const fetchBill = async () => { /* ... (this function remains the same) ... */ };
    fetchBill();
  }, [id, session]);

  // NEW: Effect to fetch translation when bill or language changes
  useEffect(() => {
    if (!bill) return;

    // If we are on the default language, clear any existing translation
    if (currentLanguage === 'en') {
      setTranslatedBill(null);
      return;
    }
    
    const fetchTranslation = async () => {
      setIsTranslating(true);
      Speech.stop(); // Stop any speech from the previous language
      try {
        const { data, error } = await supabase.functions.invoke('translate-bill', {
          body: { bill_id: bill.id, language_code: currentLanguage },
        });
        if (error) throw error;
        setTranslatedBill(data);
      } catch (e: any) {
        console.error("Translation failed:", e.message);
        // Optionally show a toast to the user
      } finally {
        setIsTranslating(false);
      }
    };

    fetchTranslation();
  }, [bill, currentLanguage]);
  
  const handleSpeak = async () => { /* ... (this function remains the same) ... */ };
  const handleShare = async () => { /* ... (this function remains the same) ... */ };
  const handleGoBack = () => { /* ... (this function remains the same) ... */ };
  if (loading) { /* ... (this function remains the same) ... */ }
  if (error || !bill) { /* ... (this function remains the same) ... */ }

  // Use translated content if available, otherwise fall back to original
  const displayTitle = translatedBill?.title || bill.title;
  const displayBillForSlider = translatedBill ? { ...bill, ...translatedBill } : bill;

  return (
    <ScrollView /* ... */ >
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={handleGoBack}>
          {/* ... */}
        </Pressable>
        
        <Text variant="headlineMedium" style={styles.title}>{bill.bill_number}</Text>
        
        {/* Display title or a loading indicator while translating */}
        {isTranslating ? (
          <View style={styles.translatingContainer}>
            <PaperActivityIndicator size="small" />
            <Text style={styles.translatingText}>Translating...</Text>
          </View>
        ) : (
          <Text variant="titleLarge" style={styles.subtitle}>{displayTitle}</Text>
        )}
        
        <View style={styles.actionsContainer}>
          {/* ... (buttons remain the same) ... */}
        </View>

        {/* ... (panel review remains the same) ... */}
        
        <Divider style={styles.divider} />
        <FindYourRep bill={bill} />
        <Divider style={styles.divider} />
        
        {/* Pass the potentially translated bill to the slider */}
        <SummarySlider bill={displayBillForSlider} onSummaryChange={setActiveSummaryText} />

        <Divider style={styles.divider} />
        <RelatedBills billId={bill.id} />

        {/* ... (attribution remains the same) ... */}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  billNumber: {
    fontWeight: "bold",
  },
  title: {
    marginBottom: 8,
    lineHeight: 22,
  },
  summary: {
    color: 'grey',
  },
  actions: {
    paddingHorizontal: 8,
    paddingTop: 8, 
  },
  reactionContainer: {
    flexDirection: 'row',
  },
    translatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  translatingText: {
    marginLeft: 12,
    fontSize: 18,
    fontStyle: 'italic',
  },
});