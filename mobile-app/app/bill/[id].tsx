// mobile-app/app/(tabs)/bill/[id].tsx

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Pressable, ScrollView, ActivityIndicator, Share, Linking } from 'react-native';
import { Text, useTheme, Divider, Button, Card, IconButton, ActivityIndicator as PaperActivityIndicator } from 'react-native-paper';
import * as Speech from 'expo-speech';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

// CORRECTED: Using path aliases for all src/* imports
import { trackEvent } from '@/lib/analytics';
import { useAuth } from '@/providers/AuthProvider';
import { supabase } from '@/lib/supabase';
import { Bill } from '@/components/Bill';
import SummarySlider from '@/components/SummarySlider';
import FindYourRep from '@/components/FindYourRep';
import RelatedBills from '@/components/RelatedBills';
import EmptyState from '@/components/EmptyState';

// These imports are outside of src, so they keep their relative paths
import { ThemedView } from '../../../components/ThemedView';
import { IconSymbol } from '../../../components/ui/IconSymbol';

type TranslatedContent = Pick<Bill, 'title' | 'description' | 'summary_simple' | 'summary_medium' | 'summary_complex'>;

export default function BillDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const { i18n } = useTranslation();
  const currentLanguage = i18n.language;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  
  const [bill, setBill] = useState<Bill | null>(null);
  const [translatedContent, setTranslatedContent] = useState<TranslatedContent | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSummaryText, setActiveSummaryText] = useState('');
  
  const backButtonColor = theme.colors.onSurface;

  useEffect(() => {
    if (!id) return;
    const fetchBill = async () => {
      Speech.stop(); setLoading(true);
      try {
        const { data, error } = await supabase.from("bills").select("*").eq("id", id).single();
        if (error) throw error;
        setBill(data);
        if (data && session?.user?.id) {
          trackEvent('bill_view', session.user.id, { bill_id: data.id });
        }
      } catch (err: any) { setError(err.message); } finally { setLoading(false); }
    };
    fetchBill();
  }, [id, session]);

  useEffect(() => {
    if (!bill) return;
    if (currentLanguage === 'en') { setTranslatedContent(null); return; }
    
    const fetchTranslation = async () => {
      setIsTranslating(true); Speech.stop();
      try {
        const { data, error } = await supabase.functions.invoke('translate-bill', {
          body: { bill_id: bill.id, language_code: currentLanguage },
        });
        if (error) throw error;
        setTranslatedContent(data);
      } catch (e: any) { console.error("Translation failed:", e.message); } 
      finally { setIsTranslating(false); }
    };
    fetchTranslation();
  }, [bill, currentLanguage]);
      
  const handleSpeak = async () => { if (await Speech.isSpeakingAsync()) { Speech.stop(); } else if (activeSummaryText) { Speech.speak(activeSummaryText, { language: i18n.language }); }};
  const handleShare = async () => { if (!bill) return; try { await Share.share({ message: `Check out this bill: ${bill.bill_number} - ${bill.title}.`, url: bill.state_link || undefined }); } catch (e) { console.error('Error sharing:', e); } };
  const handleGoBack = () => { Speech.stop(); router.push('/(tabs)'); };

  if (loading) { return ( <ThemedView style={styles.centeredContainer}><ActivityIndicator size="large" /></ThemedView> ); }
  if (error || !bill) { return ( <View style={styles.centeredContainer}><Pressable style={styles.backButton} onPress={handleGoBack}><IconSymbol name="chevron.left" color={backButtonColor} size={24} style={styles.backIcon} /><Text style={{ fontSize: 16 }}>Back</Text></Pressable><EmptyState icon="x.circle" title={error ? "An Error Occurred" : "Bill Not Found"} message={error || `The bill with ID #${id} could not be found.`} /></View> ); }

  const displayContent = translatedContent || bill;

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom }} showsVerticalScrollIndicator={false} onScrollBeginDrag={() => Speech.stop()}>
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={handleGoBack}><IconSymbol name="chevron.left" color={backButtonColor} size={24} style={styles.backIcon} /><Text style={{ fontSize: 16 }}>Back</Text></Pressable>
        <Text variant="headlineMedium" style={styles.title}>{bill.bill_number}</Text>
        {isTranslating ? (
          <View style={styles.translatingContainer}><PaperActivityIndicator size="small" /><Text style={styles.translatingText}>Translating...</Text></View>
        ) : (
          <Text variant="titleLarge" style={styles.subtitle}>{displayContent.title}</Text>
        )}
        <View style={styles.actionsContainer}><Button icon="share-variant" mode="text" onPress={handleShare}>Share</Button><IconButton icon="volume-high" size={24} onPress={handleSpeak} accessibilityLabel="Speak summary" /></View>
        {bill.panel_review && (<Card style={styles.reviewCard} mode="outlined"><Card.Title title="Survivor Panel Review" /><Card.Content><Text variant="labelLarge" style={styles.reviewRecommendation}>Recommendation: {bill.panel_review.recommendation}</Text><Text variant="bodyMedium">{bill.panel_review.comment}</Text></Card.Content></Card>)}
        <Divider style={styles.divider} />
        <FindYourRep bill={bill} />
        <Divider style={styles.divider} />
        <SummarySlider bill={{...bill, ...displayContent}} onSummaryChange={setActiveSummaryText} />
        <Divider style={styles.divider} />
        <RelatedBills billId={bill.id} />
        {bill.original_text && (<Text style={styles.attributionText} onPress={() => Linking.openURL('https://legiscan.com')}>Original text provided by LegiScan</Text>)}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 }, centeredContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  container: { flex: 1, padding: 16, paddingBottom: 40 }, backButton: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, alignSelf: 'flex-start' },
  backIcon: { marginRight: 8 }, title: { fontWeight: 'bold' }, subtitle: { marginBottom: 16 },
  actionsContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginBottom: 8, marginLeft: -8, },
  divider: { marginVertical: 16 }, reviewCard: { marginVertical: 8 }, reviewRecommendation: { fontWeight: "bold", marginBottom: 8 },
  translatingContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 }, translatingText: { marginLeft: 12, fontSize: 18, fontStyle: 'italic', color: 'gray' },
  attributionText: { fontSize: 12, color: 'gray', textAlign: 'center', marginTop: 24, textDecorationLine: 'underline' },
});