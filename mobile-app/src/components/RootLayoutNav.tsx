import { useRouter, useSegments } from "expo-router";
import { Stack } from "expo-router";
import React, { useEffect } from "react";
import { useAuth } from "../providers/AuthProvider";
import { ThemedView } from "../../components/ThemedView";
import { useTheme } from "react-native-paper";

export default function RootLayoutNav() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const theme = useTheme(); // Use the theme from PaperProvider

  useEffect(() => {
    if (loading) return;

    const inTabsGroup = segments[0] === "(tabs)";

    if (!session) {
      // Redirect to the login page if the user is not signed in.
      router.replace("/login");
    } else if (!inTabsGroup) {
      // Redirect to the main tabs layout if the user is signed in and not in the tabs group.
      router.replace("/(tabs)");
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