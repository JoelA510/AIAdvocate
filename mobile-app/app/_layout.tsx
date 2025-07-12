import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { PaperProvider } from "react-native-paper";
import "react-native-reanimated";
import Toast from "react-native-toast-message";

import { useColorScheme } from "../hooks/useColorScheme";
import { AuthProvider } from "../src/providers/AuthProvider";

// You can merge themes later, but for now, we'll just use the navigation theme
// and let Paper's default theme adapt.

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  if (!loaded) {
    return null;
  }

  const navigationTheme = colorScheme === 'dark' ? NavigationDarkTheme : NavigationDefaultTheme;

  return (
    <PaperProvider>
      <AuthProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="bill/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
        <Toast />
      </AuthProvider>
      <StatusBar style="auto" />
    </PaperProvider>
  );
}