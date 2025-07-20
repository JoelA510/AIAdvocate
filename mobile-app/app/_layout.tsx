import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useState } from "react";
import { PaperProvider } from "react-native-paper";
import "react-native-reanimated";
import Toast from "react-native-toast-message";

import { useColorScheme } from "../hooks/useColorScheme";
import { AuthProvider, useAuth } from "../src/providers/AuthProvider";
import { LightTheme, DarkTheme } from "../constants/paper-theme"; // Import our custom themes
import RootLayoutNav from "../src/components/RootLayoutNav";

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const colorScheme = useColorScheme();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    if (fontError) {
      console.error("Font loading error:", fontError);
    }
    setIsClient(true);
  }, [fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  // Determine which theme to use
  const theme = colorScheme === "dark" ? DarkTheme : LightTheme;

  return (
    <PaperProvider theme={theme}>
      <AuthProvider>
        <RootLayoutNav />
        {isClient && <Toast />}
        <StatusBar style="auto" />
      </AuthProvider>
    </PaperProvider>
  );
}


