// mobile-app/src/components/Bill.tsx (modified)

import { useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Card, IconButton, Text, useTheme, Button } from "react-native-paper";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

export interface Bill {
  id: number;
  bill_number: string;
  title: string;
  description: string | null;
  status: string | null;
  status_text?: string | null;
  status_date?: string | null;
  progress?: any;
  calendar?: any;
  history?: any;
  state_link: string | null;
  slug?: string | null;
  summary_simple: string | null;
  summary_medium: string | null;
  summary_complex: string | null;
  // Optional language‑specific summaries.  When switching to a non‑English
  // language, these fields will be used if present; otherwise the English
  // summaries are used as a fallback.
  summary_simple_es?: string | null;
  summary_medium_es?: string | null;
  summary_complex_es?: string | null;
  is_curated: boolean;
  original_text: string | null;
  change_hash: string;
  created_at: string;
  panel_review: any;
}

export default function BillComponent({ bill }: { bill: Bill }) {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();
  const { i18n } = useTranslation();
  const userId = session?.user?.id;

  const [billDetails, setBillDetails] = useState({
    reaction_counts: {} as Record<string, number>,
    user_reaction: null as string | null,
    is_bookmarked: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const fetchDetails = async () => {
      const { data, error } = await supabase.rpc("get_bill_details_for_user", {
        p_bill_id: bill.id,
        p_user_id: userId,
      });

      if (error) {
        console.error("Error fetching bill details:", error.message);
      } else if (data) {
        setBillDetails({
          reaction_counts: data.reaction_counts || {},
          user_reaction: data.user_reaction,
          is_bookmarked: data.is_bookmarked,
        });
      }
      setLoading(false);
    };

    fetchDetails();
  }, [bill.id, userId]);

  const handleBookmark = async () => {
    if (!userId) return;
    const previousBookmarkState = billDetails.is_bookmarked;
    setBillDetails((prev) => ({ ...prev, is_bookmarked: !previousBookmarkState }));

    const { error } = await supabase.rpc("toggle_bookmark_and_subscription", {
      p_bill_id: bill.id,
      p_user_id: userId,
    });

    if (error) {
      setBillDetails((prev) => ({ ...prev, is_bookmarked: previousBookmarkState }));
      console.error("Error toggling bookmark:", error);
      Toast.show({ type: "error", text1: "Error", text2: "Could not save your change." });
    } else {
      Toast.show({
        type: "success",
        text1: previousBookmarkState ? "Bookmark Removed" : "Bookmark Saved",
      });
    }
  };

  const handleReaction = async (reactionType: string) => {
    if (!userId) return;
    const originalDetails = { ...billDetails };
    const currentReaction = billDetails.user_reaction;
    const newReaction = currentReaction === reactionType ? null : reactionType;

    const newCounts = { ...(billDetails.reaction_counts || {}) } as Record<string, number>;
    if (currentReaction) {
      newCounts[currentReaction] = (newCounts[currentReaction] || 1) - 1;
    }
    if (newReaction) {
      newCounts[newReaction] = (newCounts[newReaction] || 0) + 1;
    }

    setBillDetails({ ...billDetails, user_reaction: newReaction, reaction_counts: newCounts });

    const { error } = await supabase.rpc("handle_reaction", {
      p_bill_id: bill.id,
      p_user_id: userId,
      p_reaction_type: reactionType,
    });

    if (error) {
      setBillDetails(originalDetails);
      Toast.show({ type: "error", text1: "Error", text2: "Could not save your reaction." });
    }
  };

  const handlePress = () => {
    router.push(`/bill/${bill.id}`);
  };

  // Choose summary based on current language.  If we're viewing the app in
  // Spanish and a Spanish summary is available, use it; otherwise fall back
  // to the English simple summary.  We only show a short preview on the card.
  const lang = i18n?.language ?? "en";
  const summary =
    lang.startsWith("es") && bill.summary_simple_es ? bill.summary_simple_es : bill.summary_simple;

  return (
    <Card style={styles.card}>
      <Pressable onPress={handlePress}>
        <Card.Content>
          <View style={styles.header}>
            <Text variant="titleMedium" style={styles.billNumber}>
              {bill.bill_number}
            </Text>
            <IconButton
              icon={billDetails.is_bookmarked ? "bookmark" : "bookmark-outline"}
              iconColor={theme.colors.primary}
              size={24}
              onPress={handleBookmark}
              disabled={loading}
              accessibilityLabel="Bookmark this bill"
            />
          </View>
          <Text variant="bodyLarge" style={styles.title}>
            {bill.title}
          </Text>
          {summary && (
            <Text variant="bodyMedium" numberOfLines={3} style={styles.summary}>
              {summary}
            </Text>
          )}
        </Card.Content>
      </Pressable>
      <Card.Actions style={styles.actions}>
        <View style={styles.reactionContainer}>
          <Button
            icon="thumb-up"
            mode={billDetails.user_reaction === "upvote" ? "contained" : "text"}
            onPress={() => handleReaction("upvote")}
            disabled={loading}
          >
            {billDetails.reaction_counts.upvote || 0}
          </Button>
          <Button
            icon="thumb-down"
            mode={billDetails.user_reaction === "downvote" ? "contained" : "text"}
            onPress={() => handleReaction("downvote")}
            disabled={loading}
          >
            {billDetails.reaction_counts.downvote || 0}
          </Button>
        </View>
      </Card.Actions>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  billNumber: { fontWeight: "bold" },
  title: { marginBottom: 8 },
  summary: { color: "#555" },
  actions: { paddingHorizontal: 8, paddingBottom: 8 },
  reactionContainer: { flexDirection: "row", alignItems: "center", gap: 8 },
});
