// mobile-app/app/_layout.tsx

import "../src/lib/i18n";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { PaperProvider } from "react-native-paper";
import "react-native-reanimated";
import Toast from "react-native-toast-message";

import { useColorScheme } from "../hooks/useColorScheme";
import { AuthProvider } from "../src/providers/AuthProvider";
import { LightTheme, DarkTheme } from "../constants/paper-theme";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    // --- THIS IS THE CORRECTED FILE PATH ---
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (fontError) {
      console.error("Font loading error:", fontError);
    }
  }, [fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  // --- REVERTED A MISTAKE HERE AS WELL ---
  // This was incorrectly set to always be DarkTheme. Now it respects the color scheme.
  const theme = colorScheme === "dark" ? DarkTheme : LightTheme;

  return (
    <PaperProvider theme={theme}>
      <AuthProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* We will add the login screen back in the next step */}
        </Stack>
        <Toast />
        <StatusBar style="auto" />
      </AuthProvider>
    </PaperProvider>
  );
}