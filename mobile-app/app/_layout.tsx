// mobile-app/app/_layout.tsx

import "../src/lib/i18n";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { Provider as PaperProvider } from "react-native-paper";
import "react-native-reanimated";
import Toast from "react-native-toast-message";

import { useColorScheme } from "../hooks/useColorScheme";
import { AuthProvider } from "../src/providers/AuthProvider";
import { LightTheme, DarkTheme } from "../constants/paper-theme";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const colorScheme = useColorScheme();

  useEffect(() => {
    if (fontError) {
      console.error("Font loading error:", fontError);
    }
  }, [fontError]);

  // Render nothing while fonts load (keep your original behavior)
  if (!fontsLoaded && !fontError) {
    return null;
  }

  const theme = colorScheme === "dark" ? DarkTheme : LightTheme;

  return (
    <PaperProvider theme={theme}>
      <AuthProvider>
        <Stack>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
        <Toast />
        <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
      </AuthProvider>
    </PaperProvider>
  );
}