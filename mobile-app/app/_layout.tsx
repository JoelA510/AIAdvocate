// mobile-app/app/_layout.tsx
import "react-native-reanimated"; // must be first for Reanimated
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Provider as PaperProvider, MD3LightTheme, MD3DarkTheme } from "react-native-paper";
import Toast from "react-native-toast-message";
import { useFonts } from "expo-font";
import i18next from "i18next";

import "../src/lib/i18n"; // initialize i18n singleton early
import { useColorScheme } from "../hooks/useColorScheme";
import { AuthProvider } from "../src/providers/AuthProvider";
import { initConfig } from "../src/lib/config";
import HeaderBanner from "../components/ui/HeaderBanner";

// i18n helpers (keep)
import { LanguageProvider } from "../src/providers/LanguageProvider";

// React Query (TanStack)
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const queryClient = new QueryClient();

const BRAND = "#078A97" as const;

// Keep the splash screen visible while assets/config load.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Load any custom fonts you reference in components/themes
  const [fontsLoaded, fontError] = useFonts({
    // IMPORTANT: keys must match `fontFamily` where used
    "SpaceMono-Regular": require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  const [configError, setConfigError] = useState<string | null>(null);
  const colorScheme = useColorScheme();

  // Initialize runtime config ASAP (surface missing envs, etc.)
  useEffect(() => {
    try {
      initConfig();
    } catch (e: any) {
      setConfigError(e?.message ?? "Unknown configuration error");
    }
  }, []);

  // Hide splash when fonts are ready OR we hit a config error
  useEffect(() => {
    if (fontsLoaded || fontError || configError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError, configError]);

  // If config is invalid, render minimal error UI (no providers required)
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

  // Keep the Splash visible until fonts load (and no error)
  if (!fontsLoaded && !fontError) return null;
  if (fontError) console.error("Font loading error:", fontError);

  // ----- Paper theme (MD3) with brand accent -----
  // Minimal, safe overrides that make #078A97 the accent in both schemes.
  // We set `primary` and `surfaceTint` so headers, FABs, switches, etc. pick up the brand.
  const Light = {
    ...MD3LightTheme,
    colors: {
      ...MD3LightTheme.colors,
      primary: BRAND,
      surfaceTint: BRAND,
      // Optionally also:
      // secondary: BRAND,
    },
  };
  const Dark = {
    ...MD3DarkTheme,
    colors: {
      ...MD3DarkTheme.colors,
      primary: BRAND,
      surfaceTint: BRAND,
      // secondary: BRAND,
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
                {/* Global header/banner across the entire app */}
                <HeaderBanner />

                {/* Status bar adapts to color scheme */}
                <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />

                {/* Root stack: keep headers off here; tabs/screens set their own */}
                <Stack>
                  <Stack.Screen name="index" options={{ headerShown: false }} />
                  <Stack.Screen name="bill/[id]" options={{ headerShown: false }} />
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                </Stack>

                {/* App-wide toast/snackbar host */}
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
});
