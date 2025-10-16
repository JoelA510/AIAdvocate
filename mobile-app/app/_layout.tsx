// mobile-app/app/_layout.tsx
// Root layout wires providers, error handling, and global chrome (header/footer)
// around the Expo Router stack. The splash screen short-circuits before the
// header/footer render so the branded intro remains clean.

import "react-native-reanimated";
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Image, useWindowDimensions } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useTheme } from "react-native-paper";
import Toast from "react-native-toast-message";
import i18next from "i18next";

import "../src/lib/i18n";
import { useColorScheme } from "../hooks/useColorScheme";
import { AuthProvider } from "../src/providers/AuthProvider";
import { initConfig } from "../src/lib/config";
import { LanguageProvider } from "../src/providers/LanguageProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { Colors } from "../constants/Colors";
import { RouterErrorBoundary } from "../components/RouterErrorBoundary";
import AppThemeProvider from "@/providers/AppThemeProvider";
import HeaderBanner from "@/components/HeaderBanner";
import FooterNav from "@/components/FooterNav";
const queryClient = new QueryClient();

const BANNER = require("../assets/images/header-banner.png");
const LOGO_ASPECT_RATIO = 1500 / 257;

// Prevent splash auto-hide until assets/config load.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [configError, setConfigError] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);
  const colorScheme = useColorScheme();
  const { width: screenWidth } = useWindowDimensions();
  const resolvedWidth = screenWidth > 0 ? screenWidth : 360;
  const fallbackLogoWidth = Math.min(resolvedWidth * 0.7, 360);
  const fallbackLogoHeight = fallbackLogoWidth / LOGO_ASPECT_RATIO;

  // Initialize runtime config on mount.
  useEffect(() => {
    try {
      initConfig();
      setIsReady(true);
      SplashScreen.hideAsync().catch(() => {});
    } catch (e: any) {
      setConfigError(e?.message ?? "Unknown configuration error");
      SplashScreen.hideAsync().catch(() => {});
    }
  }, []);

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

  if (!isReady && !configError) {
    const fallbackColor = colorScheme === "dark" ? Colors.dark.background : Colors.light.background;
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
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppThemeProvider>
          <QueryClientProvider client={queryClient}>
            <LanguageProvider>
              <AuthProvider>
                <AppScaffold />
              </AuthProvider>
            </LanguageProvider>
          </QueryClientProvider>
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppScaffold() {
  const theme = useTheme();

  return (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <RouterErrorBoundary>
        <View style={[styles.scaffold, { backgroundColor: theme.colors.background }]}>
          <HeaderBanner />
          <View style={styles.mainContent}>
            <AppStack />
          </View>
          <FooterNav />
        </View>
      </RouterErrorBoundary>
      <Toast />
    </>
  );
}

function AppStack() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="bill/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="legislator/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="language" options={{ headerShown: false }} />
    </Stack>
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
  scaffold: {
    flex: 1,
  },
  mainContent: {
    flex: 1,
  },
});
