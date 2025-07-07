import { Link } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
// NEW: Import Toast
import Toast from "react-native-toast-message";

import { ThemedText } from "@/components/ThemedText";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

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
      const { data: reactionData, error: reactionError } = await supabase
        .from("reactions")
        .select("reaction_type")
        .eq("bill_id", bill.id)
        .eq("user_id", userId)
        .single();

      if (reactionData) setUserReaction(reactionData.reaction_type);
      if (reactionError && reactionError.code !== "PGRST116") {
        console.error("Error fetching user reaction:", reactionError);
      }

      const { data: bookmarkData, error: bookmarkError } = await supabase
        .from("bookmarks")
        .select("bill_id")
        .eq("bill_id", bill.id)
        .eq("user_id", userId)
        .single();

      setIsBookmarked(!!bookmarkData);
      if (bookmarkError && bookmarkError.code !== "PGRST116") {
        console.error("Error fetching user bookmark:", bookmarkError);
      }
    };

    fetchUserInteractions();
  }, [userId, bill.id]);

  useEffect(() => {
    fetchReactionCounts();
    const channel = supabase
      .channel(`bill-reactions:${bill.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reactions",
          filter: `bill_id=eq.${bill.id}`,
        },
        () => {
          fetchReactionCounts();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [bill.id, fetchReactionCounts]);

  const handleReaction = async (reactionType: string) => {
    if (!userId) {
      // MODIFIED: Replaced Alert with Toast
      Toast.show({
        type: "error",
        text1: "Authentication Error",
        text2: "Could not identify user session.",
      });
      return;
    }

    try {
      if (userReaction === reactionType) {
        const { error } = await supabase
          .from("reactions")
          .delete()
          .match({ bill_id: bill.id, user_id: userId });

        if (error) throw error;
        setUserReaction(null);
      } else {
        const { error } = await supabase.from("reactions").upsert({
          bill_id: bill.id,
          user_id: userId,
          reaction_type: reactionType,
        });

        if (error) throw error;
        setUserReaction(reactionType);
      }
    } catch (error: any) {
      // MODIFIED: Replaced Alert with Toast
      Toast.show({
        type: "error",
        text1: "Error",
        text2: `Failed to record reaction: ${error.message}`,
      });
    }
  };

  const handleBookmark = async () => {
    if (!userId) {
      // MODIFIED: Replaced Alert with Toast
      Toast.show({
        type: "error",
        text1: "Authentication Error",
        text2: "Could not identify user session.",
      });
      return;
    }

    try {
      if (isBookmarked) {
        const { error } = await supabase
          .from("bookmarks")
          .delete()
          .match({ bill_id: bill.id, user_id: userId });

        if (error) throw error;
        // MODIFIED: Replaced Alert with Toast
        Toast.show({ type: "success", text1: "Bookmark removed" });
      } else {
        const { error } = await supabase.from("bookmarks").upsert({
          bill_id: bill.id,
          user_id: userId,
        });
        if (error) throw error;
        // MODIFIED: Replaced Alert with Toast
        Toast.show({ type: "success", text1: "Bill bookmarked!" });
      }
      setIsBookmarked(!isBookmarked);
    } catch (error: any) {
      // MODIFIED: Replaced Alert with Toast
      Toast.show({
        type: "error",
        text1: "Error",
        text2: `Failed to update bookmark: ${error.message}`,
      });
    }
  };

  return (
    <Link href={`/bill/${bill.id}`} asChild>
      <Pressable>
        <View style={styles.billContainer}>
          <ThemedText type="subtitle">{bill.bill_number}</ThemedText>
          <ThemedText>{bill.title}</ThemedText>
          <View style={styles.toolbar}>
            <Pressable
              style={[
                styles.button,
                userReaction === "upvote" && styles.buttonActive,
              ]}
              onPress={() => handleReaction("upvote")}
            >
              <ThemedText>👍 Upvote ({reactionCounts.upvote || 0})</ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.button,
                userReaction === "downvote" && styles.buttonActive,
              ]}
              onPress={() => handleReaction("downvote")}
            >
              <ThemedText>
                👎 Downvote ({reactionCounts.downvote || 0})
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.button,
                userReaction === "love" && styles.buttonActive,
              ]}
              onPress={() => handleReaction("love")}
            >
              <ThemedText>❤️ Love ({reactionCounts.love || 0})</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.button, isBookmarked && styles.buttonActive]}
              onPress={handleBookmark}
            >
              <ThemedText>
                {isBookmarked ? "🔖 Saved" : "🔖 Bookmark"}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  billContainer: {
    marginBottom: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 10,
    flexWrap: "wrap",
    gap: 8,
  },
  button: {
    padding: 8,
    backgroundColor: "#eee",
    borderRadius: 5,
  },
  buttonActive: {
    backgroundColor: "#aaddff",
    borderColor: "#0a7ea4",
    borderWidth: 1,
  },
});

export default BillComponent;