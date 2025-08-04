// mobile-app/app/(tabs)/advocacy.tsx
import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import FindYourRep from '../../src/components/FindYourRep';
import { useTheme } from 'react-native-paper'; // Import the useTheme hook

export default function AdvocacyScreen() {
  const theme = useTheme(); // Get the current theme

  return (
    // Apply the theme's background color to the ScrollView
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FindYourRep />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
});