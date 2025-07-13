import { useRouter, useSegments } from "expo-router";
import { Stack } from "expo-router";
import React, { useEffect } from "react";
import { useAuth } from "../src/providers/AuthProvider";
import { ThemedView } from "../components/ThemedView";
import { useTheme } from "react-native-paper";

export default function RootLayoutNav() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const theme = useTheme(); // Use the theme from PaperProvider

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (session && inAuthGroup) {
      router.replace("/(tabs)");
    } else if (!session && !loading) {
      router.replace("/login");
    }
  }, [session, loading, segments, router]);

  if (loading) {
    return <ThemedView style={{ flex: 1, backgroundColor: theme.colors.background }} />;
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="bill/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}