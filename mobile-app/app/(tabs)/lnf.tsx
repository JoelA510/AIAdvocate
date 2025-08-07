// mobile-app/app/(tabs)/lnf.tsx

import React from 'react';
import { StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import { ThemedView } from '../../components/ThemedView';
import { Text, Button } from 'react-native-paper';

const LNF_URL = 'https://www.loveneverfailsus.com/ai-advocate';

export default function LnfScreen() {
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'web') {
    return (
      <ThemedView style={[styles.containerWeb, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
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

  // On native, wrap the WebView in a ThemedView with padding
  return (
    <ThemedView style={[styles.containerNative, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
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
  containerNative: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  containerWeb: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
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