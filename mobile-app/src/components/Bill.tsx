// mobile-app/src/components/Bill.tsx

import { useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Card, IconButton, Text, useTheme, Button } from "react-native-paper";
import Toast from "react-native-toast-message";

import { supabase } from "../lib/supabase";
import { useAuth } from "../providers/AuthProvider";

// The more detailed interface from the 'proposed' version
export interface Bill {
  id: number;
  bill_number: string;
  title: string;
  description: string | null;
  status: string | null;
  state_link: string | null;
  summary_simple: string | null;
  summary_medium: string | null;
  summary_complex: string | null;
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
  const userId = session?.user?.id;

  // State from the 'existing' version, which is more efficient
  const [billDetails, setBillDetails] = useState({
    reaction_counts: {},
    user_reaction: null,
    is_bookmarked: false,
  });
  const [loading, setLoading] = useState(true);

  // Data fetching from the 'existing' version, which gets everything at once
  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const fetchDetails = async () => {
      const { data, error } = await supabase.rpc('get_bill_details_for_user', {
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

  // handleBookmark function using the SUPERIOR logic from the 'proposed' version
  const handleBookmark = async () => {
    if (!userId) return;

    // Optimistically update the UI
    const previousBookmarkState = billDetails.is_bookmarked;
    setBillDetails(prev => ({ ...prev, is_bookmarked: !previousBookmarkState }));

    const { error } = await supabase.rpc('toggle_bookmark_and_subscription', {
      p_bill_id: bill.id,
      p_user_id: userId,
    });

    if (error) {
      setBillDetails(prev => ({ ...prev, is_bookmarked: previousBookmarkState }));
      console.error("Error toggling bookmark:", error);
      Toast.show({ type: "error", text1: "Error", text2: "Could not save your change." });
    } else {
      Toast.show({ type: "success", text1: previousBookmarkState ? "Bookmark Removed" : "Bookmark Saved" });
    }
  };
  
  // handleReaction function brought over from the 'existing' version
  const handleReaction = async (reactionType: string) => {
    if (!userId) return;

    // A more stable way to do optimistic updates
    const originalDetails = { ...billDetails };
    const currentReaction = billDetails.user_reaction;
    const newReaction = currentReaction === reactionType ? null : reactionType;
    
    // Create a mutable copy of reaction counts to update
    const newCounts = { ...(billDetails.reaction_counts || {}) };
    if (currentReaction) {
        newCounts[currentReaction] = (newCounts[currentReaction] || 1) - 1;
    }
    if (newReaction) {
        newCounts[newReaction] = (newCounts[newReaction] || 0) + 1;
    }

    setBillDetails({
        ...billDetails,
        user_reaction: newReaction,
        reaction_counts: newCounts,
    });

    const { error } = await supabase.rpc('handle_reaction', {
      p_bill_id: bill.id,
      p_user_id: userId,
      p_reaction_type: reactionType,
    });

    if (error) {
      setBillDetails(originalDetails); // Revert on error
      Toast.show({ type: 'error', text1: 'Error', text2: 'Could not save your reaction.' });
    }
  };

  const handlePress = () => {
    router.push(`/(tabs)/bill/${bill.id}`);
  };

  return (
    <Card style={styles.card}>
      {/* Use the superior Pressable wrapper from the 'proposed' version */}
      <Pressable onPress={handlePress}>
        <Card.Content>
          {/* Use the superior header/summary layout from the 'proposed' version */}
          <View style={styles.header}>
            <Text variant="titleMedium" style={styles.billNumber}>{bill.bill_number}</Text>
            <IconButton
              icon={billDetails.is_bookmarked ? "bookmark" : "bookmark-outline"}
              iconColor={theme.colors.primary}
              size={24}
              onPress={handleBookmark}
              disabled={loading}
              accessibilityLabel="Bookmark this bill"
            />
          </View>
          <Text variant="bodyLarge" style={styles.title}>{bill.title}</Text>
          {bill.summary_simple && (
            <Text variant="bodyMedium" numberOfLines={3} style={styles.summary}>{bill.summary_simple}</Text>
          )}
        </Card.Content>
      </Pressable>
      {/* ADD BACK the Card.Actions from the 'existing' version to hold reactions */}
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

// Merged styles from both versions
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
    paddingTop: 0, // No extra space needed above
  },
  reactionContainer: {
    flexDirection: 'row',
  },
});