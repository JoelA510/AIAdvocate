import React, { useState, useEffect, useCallback } from "react";
import { StyleSheet, View, Pressable, Alert } from "react-native";
import { ThemedText } from "@/components/ThemedText";
import { Link } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/AuthProvider";

// The Bill type defines the shape of the bill data this component expects.
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

export default function BillComponent({ bill }: BillProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  // State to hold the reaction counts fetched from the database.
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>(
    {},
  );

  useEffect(() => {
    // This function is now defined inside the useEffect hook to prevent
    // it from being recreated on every render, fixing the dependency array warning.
    const fetchReactionCounts = async () => {
      try {
        const { data, error } = await supabase.rpc("get_reaction_counts", {
          bill_id_param: bill.id,
        });

        if (error) throw error;

        // The RPC function returns a single JSON object, which is simpler to handle.
        setReactionCounts(data || {});
      } catch (error: any) {
        console.error("Error fetching reaction counts:", error.message);
      }
    };

    // Fetch initial counts when the component first loads.
    fetchReactionCounts();

    // Set up a real-time subscription to the 'reactions' table.
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
        (payload) => {
          console.log(`Realtime change received for bill #${bill.id}`, payload);
          // When any change occurs (insert, update, delete), re-fetch the aggregate counts.
          fetchReactionCounts();
        },
      )
      .subscribe();

    // Clean up the subscription when the component is unmounted.
    return () => {
      supabase.removeChannel(channel);
    };
  }, [bill.id]); // The hook only needs to re-run if the bill.id itself changes.

  const handleReaction = async (reactionType: string) => {
    if (!userId) {
      Alert.alert("Authentication Error", "Could not identify user session.");
      return;
    }

    try {
      // Upsert the user's reaction. This will create or update their reaction.
      const { error } = await supabase.from("reactions").upsert({
        bill_id: bill.id,
        user_id: userId,
        reaction_type: reactionType,
      });

      if (error) throw error;

      Alert.alert("Success", `Your reaction has been recorded!`);
      // NOTE: We no longer need to optimistically update the state here,
      // because the real-time subscription will trigger a re-fetch automatically.
    } catch (error: any) {
      Alert.alert("Error", `Failed to record reaction: ${error.message}`);
    }
  };

  const handleBookmark = async () => {
    if (!userId) {
      Alert.alert("Authentication Error", "Could not identify user session.");
      return;
    }

    try {
      // Upsert into bookmarks. If the user has already bookmarked it,
      // this does nothing, which is fine. To add un-bookmarking, this would
      // need to be changed to a check-then-delete flow.
      const { error } = await supabase.from("bookmarks").upsert({
        bill_id: bill.id,
        user_id: userId,
      });

      if (error) throw error;

      Alert.alert("Success", "Bill bookmarked!");
    } catch (error: any) {
      Alert.alert("Error", `Failed to bookmark bill: ${error.message}`);
    }
  };

  return (
    // Link component handles navigation to the bill details screen.
    <Link href={`/bill/${bill.id}`} asChild>
      <Pressable>
        <View style={styles.billContainer}>
          <ThemedText type="subtitle">{bill.bill_number}</ThemedText>
          <ThemedText>{bill.title}</ThemedText>
          <View style={styles.toolbar}>
            <Pressable
              style={styles.button}
              onPress={() => handleReaction("upvote")}
            >
              <ThemedText>👍 Upvote ({reactionCounts.upvote || 0})</ThemedText>
            </Pressable>
            <Pressable
              style={styles.button}
              onPress={() => handleReaction("downvote")}
            >
              <ThemedText>
                👎 Downvote ({reactionCounts.downvote || 0})
              </ThemedText>
            </Pressable>
            <Pressable
              style={styles.button}
              onPress={() => handleReaction("love")}
            >
              <ThemedText>❤️ Love ({reactionCounts.love || 0})</ThemedText>
            </Pressable>
            <Pressable style={styles.button} onPress={handleBookmark}>
              <ThemedText>🔖 Bookmark</ThemedText>
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
  },
  button: {
    padding: 8,
    backgroundColor: "#eee",
    borderRadius: 5,
  },
});

export default BillComponent;
