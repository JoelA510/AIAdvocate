import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';

export type Bill = {
  id: number;
  bill_number: string;
  title: string;
  // Add other bill properties here as needed
};

type BillProps = {
  bill: Bill;
};

export default function BillComponent({ bill }: BillProps) {
  return (
    <View style={styles.billContainer}>
      <ThemedText type="subtitle">{bill.bill_number}</ThemedText>
      <ThemedText>{bill.title}</ThemedText>
    </View>
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
