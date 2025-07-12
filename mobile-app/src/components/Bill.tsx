import { Link } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button, Card, Text } from "react-native-paper";
import Toast from "react-native-toast-message";

import { ThemedText } from "../../components/ThemedText";
import { supabase } from "../lib/supabase";
import { useAuth } from "../providers/AuthProvider";

export type Bill = {
  id: number;
  bill_number: string;
  title: string;
  summary_simple: string;
  summary_medium: string;
  summary_complex: string;
};

type BillProps = {
  bill: Bill;
};

function BillComponent({ bill }: BillProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>(
    {},
  );
  const [userReaction, setUserReaction] = useState<string | null>(null);
  const [isBookmarked, setIsBookmarked] = useState(false);

  // ... (All the data-fetching and handler logic remains the same)
  const fetchReactionCounts = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc("get_reaction_counts", {
        bill_id_param: bill.id,
      });
      if (error) throw error;
      setReactionCounts(data || {});
    } catch (error: any) {
      console.error("Error fetching reaction counts:", error.message);
    }
  }, [bill.id]);

  useEffect(() => {
    if (!userId) return;
    const fetchUserInteractions = async () => {
      const { data: reactionData } = await supabase
        .from("reactions")
        .select("reaction_type")
        .eq("bill_id", bill.id)
        .eq("user_id", userId)
        .single();
      if (reactionData) setUserReaction(reactionData.reaction_type);

      const { data: bookmarkData } = await supabase
        .from("bookmarks")
        .select("bill_id")
        .eq("bill_id", bill.id)
        .eq("user_id", userId)
        .single();
      setIsBookmarked(!!bookmarkData);
    };
    fetchUserInteractions();
  }, [userId, bill.id]);

  useEffect(() => {
    fetchReactionCounts();
    const channel = supabase
      .channel(`bill-reactions:${bill.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reactions", filter: `bill_id=eq.${bill.id}`}, () => {
        fetchReactionCounts();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [bill.id, fetchReactionCounts]);
  
  const handleReaction = async (reactionType: string) => {
    if (!userId) return;
    try {
      if (userReaction === reactionType) {
        await supabase.from("reactions").delete().match({ bill_id: bill.id, user_id: userId });
        setUserReaction(null);
      } else {
        await supabase.from("reactions").upsert({ bill_id: bill.id, user_id: userId, reaction_type: reactionType });
        setUserReaction(reactionType);
      }
    } catch (error: any) {
      Toast.show({ type: "error", text1: "Error", text2: `Failed to record reaction: ${error.message}` });
    }
  };

  const handleBookmark = async () => {
    if (!userId) return;
    try {
      if (isBookmarked) {
        await supabase.from("bookmarks").delete().match({ bill_id: bill.id, user_id: userId });
        Toast.show({ type: "success", text1: "Bookmark removed" });
      } else {
        await supabase.from("bookmarks").upsert({ bill_id: bill.id, user_id: userId });
        Toast.show({ type: "success", text1: "Bill bookmarked!" });
      }
      setIsBookmarked(!isBookmarked);
    } catch (error: any) {
      Toast.show({ type: "error", text1: "Error", text2: `Failed to update bookmark: ${error.message}` });
    }
  };
  
  return (
    <Link href={`/bill/${bill.id}`} asChild>
      <Pressable>
        {/* NEW: Using Card component for a modern look */}
        <Card style={styles.card} mode="elevated">
          <Card.Title title={bill.bill_number} titleVariant="headlineSmall" />
          <Card.Content>
            <Text variant="titleMedium">{bill.title}</Text>
          </Card.Content>
          {/* NEW: Using Card.Actions for the button toolbar */}
          <Card.Actions style={styles.actions}>
            <View style={styles.reactionContainer}>
              <Button
                icon="thumb-up"
                mode={userReaction === "upvote" ? "contained" : "text"}
                onPress={() => handleReaction("upvote")}
              >
                {reactionCounts.upvote || 0}
              </Button>
              <Button
                icon="thumb-down"
                mode={userReaction === "downvote" ? "contained" : "text"}
                onPress={() => handleReaction("downvote")}
              >
                {reactionCounts.downvote || 0}
              </Button>
              <Button
                icon="heart"
                mode={userReaction === "love" ? "contained" : "text"}
                onPress={() => handleReaction("love")}
              >
                {reactionCounts.love || 0}
              </Button>
            </View>
            <Button
              icon={isBookmarked ? "bookmark" : "bookmark-outline"}
              onPress={handleBookmark}
              style={{ marginLeft: 'auto' }} // Pushes the bookmark to the right
            >
              Save
            </Button>
          </Card.Actions>
        </Card>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
  },
  actions: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reactionContainer: {
    flexDirection: 'row',
  },
});

export default BillComponent;