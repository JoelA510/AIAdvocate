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
import { Provider as PaperProvider, MD3LightTheme, MD3DarkTheme } from "react-native-paper";
import Toast from "react-native-toast-message";
import { useFonts } from "expo-font";
import i18next from "i18next";

import "../src/lib/i18n";
import { useColorScheme } from "../hooks/useColorScheme";
import { AuthProvider } from "../src/providers/AuthProvider";
import { initConfig } from "../src/lib/config";
import { LanguageProvider } from "../src/providers/LanguageProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const queryClient = new QueryClient();

const BRAND = "#078A97" as const;
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

  // If config failed, show a minimal error screen.
  if (configError) {
    const t = (k: string, d: string) => i18next.t(k, d);
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>{t("config.errorTitle", "Configuration Error")}</Text>
        <Text style={styles.errorBody}>{configError}</Text>
        <Text style={styles.errorHint}>
          {t("config.errorHint", "Check your mobile-app/.env and restart the dev server.")}
        </Text>
      </View>
    );
  }

  if (!fontsLoaded && !fontError) {
    const fallbackColor = colorScheme === "dark" ? "#0b0b0b" : "#ffffff";
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

  // Theme overrides for MD3.
  const Light = {
    ...MD3LightTheme,
    colors: {
      ...MD3LightTheme.colors,
      primary: BRAND,
      surfaceTint: BRAND,
    },
  };
  const Dark = {
    ...MD3DarkTheme,
    colors: {
      ...MD3DarkTheme.colors,
      primary: BRAND,
      surfaceTint: BRAND,
    },
  };
  const theme = colorScheme === "dark" ? Dark : Light;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <PaperProvider theme={theme}>
          <QueryClientProvider client={queryClient}>
            <LanguageProvider>
              <AuthProvider>
                <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
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
    backgroundColor: "#fff",
    justifyContent: "flex-start",
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 12,
  },
  errorBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "#333",
  },
  errorHint: {
    marginTop: 16,
    fontSize: 12,
    color: "#666",
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
