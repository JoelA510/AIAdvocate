// mobile-app/app/(tabs)/lnf.tsx (modified)
import React from "react";
import { StyleSheet, View, Platform, Linking, Pressable } from "react-native";
import { Stack } from "expo-router";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import { ThemedView } from "../../components/ThemedView";
import { ThemedText } from "../../components/ThemedText";
import { Card, Button } from "react-native-paper";

const FEED_URL = (process.env.EXPO_PUBLIC_LNF_URL?.trim() ||
  "https://www.loveneverfailsus.com/") as string;

export default function LnfScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{ title: t("tabs.lnf", { defaultValue: "LNF" }), headerShown: false }}
      />
      {/* Apply safe-area padding for top/bottom; horizontal padding only on web */}
      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        {Platform.OS === "web" ? (
          <Card mode="elevated" style={styles.heroCard}>
            <Pressable onPress={() => Linking.openURL(FEED_URL)} style={{ flex: 1 }}>
              <View style={styles.heroBody}>
                <ThemedText type="title" style={{ marginBottom: 8 }}>
                  {t("lnf.webBestAtSource", { defaultValue: "Best experienced on the website" })}
                </ThemedText>
                <ThemedText style={{ opacity: 0.8, marginBottom: 16 }}>
                  {t("lnf.webCspNote", {
                    defaultValue:
                      "This publisher blocks embedding for security. Click below to open the feed directly.",
                  })}
                </ThemedText>
                <Button mode="contained" onPress={() => Linking.openURL(FEED_URL)}>
                  {t("lnf.open", { defaultValue: "Open Feed" })}
                </Button>
              </View>
            </Pressable>
          </Card>
        ) : (
          <WebView
            source={{ uri: FEED_URL }}
            startInLoadingState
            setSupportMultipleWindows={false}
            style={{ flex: 1 }}
          />
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Remove horizontal padding on mobile; keep 16px on web.
  content: {
    flex: 1,
    paddingHorizontal: Platform.OS === "web" ? 16 : 0,
  },
  heroCard: { flex: 1, justifyContent: "center" },
  heroBody: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 8 },
});
