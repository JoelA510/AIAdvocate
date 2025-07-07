import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import "react-native-reanimated";
// NEW: Import the Toast component
import Toast from "react-native-toast-message";

import { useColorScheme } from "@/hooks/useColorScheme";
import { AuthProvider } from "@/providers/AuthProvider";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  if (!loaded) {
    // Async font loading only occurs in development.
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        {/* MODIFIED: Wrap Stack in a fragment and add Toast */}
        <>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="+not-found" />
            <Stack.Screen name="bill/[id]" options={{ headerShown: false }} />
          </Stack>

          {/* NEW: The Toast component is rendered here. It overlays the entire app. */}
          <Toast />
        </>
      </AuthProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}