import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import "react-native-reanimated";
import Toast from "react-native-toast-message";

import { useColorScheme } from "../hooks/useColorScheme";
import { AuthProvider, useAuth } from "../src/providers/AuthProvider";
import { ThemedView } from "../components/ThemedView";

function RootLayoutNav() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) {
      return; // Wait until the session is loaded
    }

    const inTabsGroup = segments[0] === "(tabs)";

    if (session && !inTabsGroup) {
      // User is signed in and not in the main app area, redirect them
      router.replace("/(tabs)");
    } else if (!session && !loading) {
      // User is not signed in, redirect them to the login screen
      router.replace("/login");
    }
  }, [session, loading, segments, router]);

  if (loading) {
    // You can show a loading indicator here if you want
    return <ThemedView style={{ flex: 1 }} />;
  }

  return (
    <>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="login"
          options={{
            headerShown: false,
            presentation: "modal",
          }}
        />
        <Stack.Screen name="bill/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <Toast />
    </>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}