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

  

  const handleReaction = async (reactionType: string) => {
    const currentReaction = billDetails.user_reaction;
    const newReaction = currentReaction === reactionType ? null : reactionType;

    // Optimistically update the UI
    setBillDetails({
      ...billDetails,
      user_reaction: newReaction,
      reaction_counts: {
        ...billDetails.reaction_counts,
        [reactionType]: (billDetails.reaction_counts[reactionType] || 0) + (newReaction ? 1 : -1),
        ...(currentReaction && { [currentReaction]: (billDetails.reaction_counts[currentReaction] || 1) - 1 }),
      },
    });

    try {
      const { error } = await supabase.rpc('handle_reaction', {
        p_bill_id: bill.id,
        p_user_id: userId,
        p_reaction_type: reactionType,
      });
      if (error) throw error;
    } catch (error: any) {
      // Revert the UI if the DB operation fails
      setBillDetails(billDetails);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.message || 'Could not update your reaction.',
      });
    }
  };

  const handleBookmark = async () => {
    const currentIsBookmarked = billDetails.is_bookmarked;
    const newIsBookmarked = !currentIsBookmarked;

    // Optimistically update the UI
    setBillDetails({ ...billDetails, is_bookmarked: newIsBookmarked });

    try {
      if (newIsBookmarked) {
        // Add the bookmark
        const { error } = await supabase
          .from('bookmarks')
          .insert({ user_id: userId, bill_id: bill.id });
        if (error) throw error;
        Toast.show({
          type: 'success',
          text1: 'Saved!',
          text2: 'This bill has been added to your list.',
        });
      } else {
        // Remove the bookmark
        const { error } = await supabase
          .from('bookmarks')
          .delete()
          .match({ user_id: userId, bill_id: bill.id });
        if (error) throw error;
        Toast.show({
          type: 'info',
          text1: 'Removed',
          text2: 'This bill has been removed from your list.',
        });
      }
    } catch (error: any) {
      // Revert the UI if the DB operation fails
      setBillDetails({ ...billDetails, is_bookmarked: currentIsBookmarked });
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.message || 'Could not update your bookmark.',
      });
    }
  };

  return (
    <Card style={styles.card} mode="elevated">
      <Link href={`/bill/${bill.id}`} asChild>
        <Pressable>
          <Card.Title title={bill.bill_number} titleVariant="headlineSmall" />
          <Card.Content>
            <Text variant="titleMedium">{bill.title}</Text>
          </Card.Content>
        </Pressable>
      </Link>
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
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 16 },
  actions: { paddingHorizontal: 12, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reactionContainer: { flexDirection: 'row' },
});

export default BillComponent;