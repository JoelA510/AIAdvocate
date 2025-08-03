// mobile-app/app/index.tsx

import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator } from 'react-native-paper';
import { ThemedView } from '../components/ThemedView';
import { useAuth } from '../src/providers/AuthProvider';

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    // Show a loading spinner while we check for a session
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator animating={true} />
      </ThemedView>
    );
  }

  if (!session) {
    // If the user is not signed in, redirect to the login screen.
    return <Redirect href="/login" />;
  }

  // If the user is signed in, redirect to the main app screen.
  return <Redirect href="/(tabs)" />;
}