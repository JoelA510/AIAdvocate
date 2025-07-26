// mobile-app/app/(tabs)/lnf.tsx

import React from 'react';
import { StyleSheet, Platform } from 'react-native'; // Import Platform
import { WebView } from 'react-native-webview';
import { ThemedView } from '../../components/ThemedView';
import { Text, Button } from 'react-native-paper';
import * as Linking from 'expo-linking';

const LNF_URL = 'https://www.loveneverfailsus.com/ai-advocate';

export default function LnfScreen() {
  // **THE FIX:** Check if the current platform is 'web'.
  if (Platform.OS === 'web') {
    // On the web, render a simple link instead of the WebView.
    return (
      <ThemedView style={styles.containerWeb}>
        <Text variant="headlineSmall" style={styles.titleWeb}>
          Visit Love Never Fails
        </Text>
        <Text variant="bodyLarge" style={styles.textWeb}>
          Our web view is best experienced on our full site.
        </Text>
        <Button
          mode="contained"
          onPress={() => Linking.openURL(LNF_URL)}
          style={styles.buttonWeb}
        >
          Open loveneverfailsus.com
        </Button>
      </ThemedView>
    );
  }

  // On native (Android/iOS), render the WebView as intended.
  return (
    <ThemedView style={styles.containerNative}>
      <WebView
        source={{ uri: LNF_URL }}
        style={styles.webview}
        allowsInlineMediaPlayback
        javaScriptEnabled
        domStorageEnabled
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  // Styles for the native WebView
  containerNative: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  // Styles for the web fallback view
  containerWeb: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  titleWeb: {
    fontWeight: 'bold',
  },
  textWeb: {
    textAlign: 'center',
  },
  buttonWeb: {
    marginTop: 16,
  },
});