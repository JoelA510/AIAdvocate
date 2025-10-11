// mobile-app/app/_layout.tsx
// Root layout sets up providers and the navigation stack.  The global
// header/banner is intentionally omitted here so the splash screen can
// animate without a second banner underneath.

import "react-native-reanimated";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image, useWindowDimensions } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Provider as PaperProvider } from "react-native-paper";
import Toast from "react-native-toast-message";
import { useFonts } from "expo-font";
import i18next from "i18next";

import "../src/lib/i18n";
import { useColorScheme } from "../hooks/useColorScheme";
import { AuthProvider } from "../src/providers/AuthProvider";
import { initConfig } from "../src/lib/config";
import { LanguageProvider } from "../src/providers/LanguageProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LightTheme, DarkTheme } from "../constants/paper-theme";
const queryClient = new QueryClient();

const paletteFor = (scheme: "light" | "dark") =>
  scheme === "dark" ? DarkTheme.colors : LightTheme.colors;
const BANNER = require("../assets/images/header-banner.png");
const LOGO_ASPECT_RATIO = 1500 / 257;

// Prevent splash auto-hide until assets/config load.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    "SpaceMono-Regular": require("../assets/fonts/SpaceMono-Regular.ttf"),
  });
  const [configError, setConfigError] = useState<string | null>(null);
  const colorScheme = useColorScheme();
  const { width: screenWidth } = useWindowDimensions();
  const resolvedWidth = screenWidth > 0 ? screenWidth : 360;
  const fallbackLogoWidth = Math.min(resolvedWidth * 0.7, 360);
  const fallbackLogoHeight = fallbackLogoWidth / LOGO_ASPECT_RATIO;

  // Initialize runtime config on mount.
  useEffect(() => {
    try {
      initConfig();
    } catch (e: any) {
      setConfigError(e?.message ?? "Unknown configuration error");
    }
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (!fontsLoaded && !fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (configError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [configError]);

  const scheme = colorScheme === "dark" ? "dark" : "light";
  const palette = paletteFor(scheme);

  // If config failed, show a minimal error screen.
  if (configError) {
    const t = (k: string, d: string) => i18next.t(k, d);
    return (
      <View style={[styles.errorContainer, { backgroundColor: palette.background }]}>
        <Text style={[styles.errorTitle, { color: palette.onBackground }]}>
          {t("config.errorTitle", "Configuration Error")}
        </Text>
        <Text style={[styles.errorBody, { color: palette.onSurfaceVariant }]}>{configError}</Text>
        <Text style={[styles.errorHint, { color: palette.onSurfaceVariant }]}>
          {t("config.errorHint", "Check your mobile-app/.env and restart the dev server.")}
        </Text>
      </View>
    );
  }

  if (!fontsLoaded && !fontError) {
    const fallbackColor = palette.background;
    return (
      <View style={[styles.fallbackContainer, { backgroundColor: fallbackColor }]}>
        <Image
          source={BANNER}
          resizeMode="contain"
          style={[styles.fallbackLogo, { width: fallbackLogoWidth, height: fallbackLogoHeight }]}
          accessibilityRole="image"
          accessibilityLabel="AI Advocate"
        />
      </View>
    );
  }
  if (fontError) console.error("Font loading error:", fontError);

  const theme = scheme === "dark" ? DarkTheme : LightTheme;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <QueryClientProvider client={queryClient}>
            <LanguageProvider>
              <AuthProvider>
                <StatusBar
                  style={scheme === "dark" ? "light" : "dark"}
                  backgroundColor={palette.background}
                />
                <Stack>
                  <Stack.Screen name="index" options={{ headerShown: false }} />
                  <Stack.Screen name="bill/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="legislator/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                  <Stack.Screen name="language" options={{ headerShown: false }} />
                </Stack>
                <Toast />
              </AuthProvider>
            </LanguageProvider>
          </QueryClientProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  errorContainer: {
    flex: 1,
    padding: 24,
    paddingTop: 64,
    justifyContent: "flex-start",
    gap: 12,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  errorBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  errorHint: {
    marginTop: 4,
    fontSize: 12,
  },
  fallbackContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  fallbackLogo: {
    alignSelf: "center",
  },
});
