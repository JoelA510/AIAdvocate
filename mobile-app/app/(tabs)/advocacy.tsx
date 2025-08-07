// mobile-app/app/(tabs)/advocacy.tsx

import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import FindYourRep from '../../src/components/FindYourRep';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AdvocacyScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom }}
      showsVerticalScrollIndicator={false}
    >
      <FindYourRep />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
});