// mobile-app/app/(tabs)/_layout.tsx (modified)
import React from "react";
import { Text, Platform } from "react-native";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "react-native-paper";
import { IconSymbol } from "../../components/ui/IconSymbol";
import HeaderBanner from "../../components/ui/HeaderBanner";

/**
 * Defines the bottom tab navigation for the app.  The language selector has
 * been removed from the tab bar in favor of a floating menu in the header.
 */
export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();

  // Render tab labels without forcing uppercase/lowercase.  We rely on
  // translations in en.json/es.json to provide title‑cased names.
  const labelEl =
    (s: string) =>
    ({ color }: { focused: boolean; color: string }) => (
      <Text
        style={{
          color,
          fontSize: 12,
          fontWeight: "500",
          textTransform: "none",
        }}
        numberOfLines={1}
      >
        {s}
      </Text>
    );

  return (
    <>
      {/* Render the global header/banner inside the tab layout (so it's not shown on the splash) */}
      <HeaderBanner />
      <Tabs
        initialRouteName="highlighted"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.onSurfaceDisabled ?? "#888",
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: "500",
            textTransform: "none",
          },
          tabBarStyle: {
            borderTopWidth: Platform.OS === "web" ? 0 : undefined,
            backgroundColor: theme.colors.surface,
          },
          lazy: true,
        }}
      >
        <Tabs.Screen
          name="highlighted"
          options={{
            tabBarLabel: labelEl(t("tabs.highlighted", { defaultValue: "Highlighted" })),
            tabBarIcon: ({ color, size }) => (
              <IconSymbol name="star" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="saved"
          options={{
            tabBarLabel: labelEl(t("tabs.saved", { defaultValue: "Saved" })),
            tabBarIcon: ({ color, size }) => (
              <IconSymbol name="bookmark" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            tabBarLabel: labelEl(t("tabs.bills", { defaultValue: "Bills" })),
            tabBarIcon: ({ color, size }) => (
              <IconSymbol name="doc.text" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="lnf"
          options={{
            tabBarLabel: labelEl(t("tabs.lnf", { defaultValue: "LNF" })),
            tabBarIcon: ({ color, size }) => (
              <IconSymbol name="bolt" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="advocacy"
          options={{
            tabBarLabel: labelEl(t("tabs.advocacy", { defaultValue: "Advocacy" })),
            tabBarIcon: ({ color, size }) => (
              <IconSymbol name="megaphone" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}
