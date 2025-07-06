import React from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { Link } from 'expo-router';

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
  return (
    <Link href={`/bill/${bill.id}`} asChild>
      <Pressable>
        <View style={styles.billContainer}>
          <ThemedText type="subtitle">{bill.bill_number}</ThemedText>
          <ThemedText>{bill.title}</ThemedText>
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
});
