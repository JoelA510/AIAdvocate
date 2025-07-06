import React from 'react';
import { StyleSheet, View, Pressable, Alert } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

export type Bill = {
  id: number;
  bill_number: string;
  title: string;
  summary_simple: string;
  summary_medium: string;
  summary_complex: string;
  // Add other bill properties here as needed
};

type BillProps = {
  bill: Bill;
};

export default function BillComponent({ bill }: BillProps) {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const handleReaction = async (reactionType: string) => {
    if (!userId) {
      Alert.alert('Authentication Required', 'Please sign in to react.');
      return;
    }

    try {
      const { error } = await supabase.from('reactions').upsert({
        bill_id: bill.id,
        user_id: userId,
        reaction_type: reactionType,
      });

      if (error) {
        throw error;
      }
      Alert.alert('Success', `You ${reactionType}d this bill!`);
    } catch (error: any) {
      Alert.alert('Error', `Failed to record reaction: ${error.message}`);
    }
  };

  return (
    <Link href={`/bill/${bill.id}`} asChild>
      <Pressable>
        <View style={styles.billContainer}>
          <ThemedText type="subtitle">{bill.bill_number}</ThemedText>
          <ThemedText>{bill.title}</ThemedText>
          <View style={styles.toolbar}>
            <Pressable style={styles.button} onPress={() => handleReaction('upvote')}>
              <ThemedText>👍 Upvote</ThemedText>
            </Pressable>
            <Pressable style={styles.button} onPress={() => handleReaction('downvote')}>
              <ThemedText>👎 Downvote</ThemedText>
            </Pressable>
            <Pressable style={styles.button} onPress={() => handleReaction('love')}>
              <ThemedText>❤️ Love</ThemedText>
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
    borderColor: '#ccc',
    borderRadius: 8,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 10,
  },
  button: {
    padding: 8,
    backgroundColor: '#eee',
    borderRadius: 5,
  },
});
