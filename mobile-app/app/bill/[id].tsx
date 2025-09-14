// mobile-app/app/bill/[id].tsx (modified)

import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  ScrollView,
  ActivityIndicator,
  Share as RNShare,
  Linking,
  Platform,
} from "react-native";
import {
  Text,
  useTheme,
  Divider,
  Button,
  Card,
  ActivityIndicator as PaperActivityIndicator,
} from "react-native-paper";
import * as Speech from "expo-speech";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import Toast from "react-native-toast-message";

import { IconSymbol } from "../../components/ui/IconSymbol";
import HeaderBanner from "../../components/ui/HeaderBanner";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/providers/AuthProvider";
import { supabase } from "@/lib/supabase";
import { Bill } from "@/components/Bill";
import SummarySlider from "@/components/SummarySlider";
import FindYourRep from "@/components/FindYourRep";
import RelatedBills from "@/components/RelatedBills";
import EmptyState from "@/components/EmptyState";

type TranslatedContent = Pick<
  Bill,
  "title" | "description" | "summary_simple" | "summary_medium" | "summary_complex"
>;

export default function BillDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { session } = useAuth();
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [bill, setBill] = useState<Bill | null>(null);
  const [translatedContent, setTranslatedContent] = useState<TranslatedContent | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSummaryText, setActiveSummaryText] = useState("");

  useEffect(() => {
    let isMounted = true;
    const fetchBill = async () => {
      Speech.stop();
      setLoading(true);
      try {
        const { data, error } = await supabase.from("bills").select("*").eq("id", id).single();
        if (error) throw error;
        if (!isMounted) return;
        setBill(data as Bill);
        if (data && session?.user?.id) {
          trackEvent("bill_view", session.user.id, { bill_id: data.id }).catch(() => {});
        }
      } catch (err: any) {
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchBill();
    return () => {
      isMounted = false;
      Speech.stop();
    };
  }, [id, session]);

  // Trigger on-demand translation when language changes and not English.
  useEffect(() => {
    if (!bill) return;
    if (i18n.language === "en") {
      setTranslatedContent(null);
      return;
    }

    let isMounted = true;
    const fetchTranslation = async () => {
      setIsTranslating(true);
      Speech.stop();
      try {
        const { data, error } = await supabase.functions.invoke("translate-bill", {
          body: { bill_id: bill.id, language_code: i18n.language },
        });
        if (error) throw error;
        if (isMounted) setTranslatedContent(data as any);
      } catch (e: any) {
        console.error("Translation failed:", e.message);
      } finally {
        if (isMounted) setIsTranslating(false);
      }
    };
    fetchTranslation();
    return () => {
      isMounted = false;
    };
  }, [bill, i18n.language]);

  const handleShare = async () => {
    if (!bill) return;
    const url = bill.state_link || "";
    const text = t("bill.shareMessage", "Check out this bill: {{num}} - {{title}}.", {
      num: bill.bill_number,
      title: bill.title,
    });
    try {
      if (Platform.OS === "web") {
        const nav: any = typeof navigator !== "undefined" ? navigator : null;
        if (nav?.share) {
          await nav.share({ title: bill.bill_number, text, url });
          return;
        }
        if (nav?.clipboard?.writeText && url) {
          await nav.clipboard.writeText(url);
          Toast.show({ type: "success", text1: t("share.copied", "Link copied to clipboard") });
          return;
        }
        if (url) {
          window.open(url, "_blank", "noopener,noreferrer");
          return;
        }
        Toast.show({ type: "info", text1: t("share.nothing", "Nothing to share") });
      } else {
        await RNShare.share({ message: `${text} ${url}`.trim() });
      }
    } catch {
      // swallow share errors
    }
  };

  const handleGoBack = () => {
    Speech.stop();
    router.back();
  };

  if (loading) {
    return (
      <View style={[styles.centeredContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (error || !bill) {
    return (
      <View style={[styles.centeredContainer, { backgroundColor: theme.colors.background }]}>
        <Button
          onPress={handleGoBack}
          icon={() => <IconSymbol name="chevron.left" size={22} />}
          mode="text"
          style={{ alignSelf: "flex-start", marginBottom: 16 }}
        >
          {t("common.back", "Back")}
        </Button>
        <EmptyState
          icon="x.circle"
          title={error ? t("error.title", "An Error Occurred") : t("bill.missing", "Bill Not Found")}
          message={
            error
              ? error
              : t("bill.missingMsg", "The bill with ID #{{id}} could not be found.", { id })
          }
        />
      </View>
    );
  }

  const displayContent = (translatedContent || bill) as any;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      {/* Render the global banner atop the bill details */}
      <HeaderBanner />
      <ScrollView
        style={[styles.scrollView]}
        contentContainerStyle={{ paddingBottom: insets.bottom }}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => Speech.stop()}
      >
        <View style={styles.container}>
          <Button
            onPress={handleGoBack}
            icon={() => <IconSymbol name="chevron.left" size={24} />}
            mode="text"
            style={{ alignSelf: "flex-start", marginBottom: 16 }}
          >
            {t("common.back", "Back")}
          </Button>

          <Text variant="headlineMedium" style={styles.title}>
            {bill.bill_number}
          </Text>

          {isTranslating ? (
            <View style={styles.translatingContainer}>
              <PaperActivityIndicator size="small" />
              <Text style={styles.translatingText}>{t("bill.translating", "Translating...")}</Text>
            </View>
          ) : (
            <Text variant="titleLarge" style={styles.subtitle}>
              {displayContent.title}
            </Text>
          )}

          <View style={styles.actionsContainer}>
            <Button icon="share-variant" mode="text" onPress={handleShare}>
              {t("common.share", "Share")}
            </Button>
            {/* TTS button removed.  If re-enabled, place the TTS button here and call handleSpeak() */}
          </View>

          {bill.panel_review && (
            <Card style={styles.reviewCard} mode="outlined">
              <Card.Title title={t("bill.panel.title", "Survivor Panel Review")} />
              <Card.Content>
                <Text variant="labelLarge" style={styles.reviewRecommendation}>
                  {t("bill.panel.recommendation", "Recommendation: {{r}}", {
                    r: bill.panel_review.recommendation,
                  })}
                </Text>
                <Text variant="bodyMedium">{bill.panel_review.comment}</Text>
              </Card.Content>
            </Card>
          )}

          <Divider style={styles.divider} />
          <FindYourRep bill={bill} />
          <Divider style={styles.divider} />
          <SummarySlider bill={{ ...bill, ...displayContent }} onSummaryChange={setActiveSummaryText} />
          <Divider style={styles.divider} />
          <RelatedBills billId={bill.id} />

          {bill.original_text && (
            <Text
              style={styles.attributionText}
              onPress={() => Linking.openURL("https://legiscan.com")}
            >
              {t("bill.attribution.legiscan", "Original text provided by LegiScan")}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  centeredContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 16 },
  container: { flex: 1, padding: 16, paddingBottom: 40 },
  title: { fontWeight: "bold" },
  subtitle: { marginBottom: 16 },
  actionsContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    marginBottom: 8,
    marginLeft: -8,
  },
  divider: { marginVertical: 16 },
  reviewCard: { marginVertical: 8 },
  reviewRecommendation: { fontWeight: "bold", marginBottom: 8 },
  translatingContainer: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  translatingText: { marginLeft: 12, fontSize: 18, fontStyle: "italic", color: "gray" },
  attributionText: {
    fontSize: 12,
    color: "gray",
    textAlign: "center",
    marginTop: 24,
    textDecorationLine: "underline",
  },
});
