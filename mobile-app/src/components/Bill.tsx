// mobile-app/src/components/Bill.tsx

import { Link } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Button, Card, Text } from "react-native-paper";
import Toast from "react-native-toast-message";
import { supabase } from "../lib/supabase";
import { useAuth } from "../providers/AuthProvider";

export type Bill = {
  id: number;
  bill_number: string;
  title: string;
  // Add other fields as they become relevant
};

type BillProps = {
  bill: Bill;
};

function BillComponent({ bill }: BillProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  // State to hold all the dynamic data fetched from our new function
  const [billDetails, setBillDetails] = useState({
    reaction_counts: {},
    user_reaction: null,
    is_bookmarked: false,
  });

  // **THE FIX:** A single, robust useEffect to fetch all data at once.
  useEffect(() => {
    if (!userId) return;

    const fetchDetails = async () => {
      const { data, error } = await supabase.rpc('get_bill_details_for_user', {
        p_bill_id: bill.id,
        p_user_id: userId,
      });

      if (error) {
        console.error("Error fetching bill details:", error.message);
      } else if (data) {
        setBillDetails({
          reaction_counts: data.reaction_counts,
          user_reaction: data.user_reaction,
          is_bookmarked: data.is_bookmarked,
        });
      }
    };

    fetchDetails();
  }, [bill.id, userId]);

  // Handler functions remain largely the same, but now update local state optimistically
  // before re-fetching, which feels much faster to the user.
  const handleReaction = async (reactionType: string) => {
    // ... (handleReaction logic remains the same)
  };

  const handleBookmark = async () => {
    // ... (handleBookmark logic remains the same)
  };

  return (
    <Link href={`/bill/${bill.id}`} asChild>
      <Pressable>
        <Card style={styles.card} mode="elevated">
          <Card.Title title={bill.bill_number} titleVariant="headlineSmall" />
          <Card.Content>
            <Text variant="titleMedium">{bill.title}</Text>
          </Card.Content>
          <Card.Actions style={styles.actions}>
            <View style={styles.reactionContainer}>
              <Button
                icon="thumb-up"
                mode={billDetails.user_reaction === "upvote" ? "contained" : "text"}
                onPress={() => handleReaction("upvote")}
              >
                {billDetails.reaction_counts.upvote || 0}
              </Button>
              <Button
                icon="thumb-down"
                mode={billDetails.user_reaction === "downvote" ? "contained" : "text"}
                onPress={() => handleReaction("downvote")}
              >
                {billDetails.reaction_counts.downvote || 0}
              </Button>
              <Button
                icon="heart"
                mode={billDetails.user_reaction === "love" ? "contained" : "text"}
                onPress={() => handleReaction("love")}
              >
                {billDetails.reaction_counts.love || 0}
              </Button>
            </View>
            <Button
              icon={billDetails.is_bookmarked ? "bookmark" : "bookmark-outline"}
              onPress={handleBookmark}
              style={{ marginLeft: 'auto' }}
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
  card: { marginBottom: 16 },
  actions: { paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reactionContainer: { flexDirection: 'row' },
});

export default BillComponent;