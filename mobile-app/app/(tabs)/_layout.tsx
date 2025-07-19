import { Tabs } from "expo-router";
import React from "react";
import { Platform, StyleSheet } from "react-native";
import { useTheme } from "react-native-paper"; // Import useTheme

import { HapticTab } from "../../components/HapticTab";
import { IconSymbol } from "../../components/ui/IconSymbol";
import TabBarBackground from "../../components/ui/TabBarBackground";
// We no longer need the old Colors or useColorScheme hook
// import { Colors } from "../../constants/Colors";
// import { useColorScheme } from "../../hooks/useColorScheme";

export default function TabLayout() {
  const theme = useTheme(); // Get the theme from PaperProvider

  return (
    <Tabs
      screenOptions={{
        // Set active and inactive colors from the theme
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
        headerShown: false,
        tabBarButton: HapticTab,
        // The custom background component is kept for the iOS blur effect
        tabBarBackground: TabBarBackground,
        tabBarStyle: {
          // **THIS IS THE KEY FIX**: Apply a background color from the theme.
          backgroundColor: theme.colors.surface,
          // The rest of the styles ensure the blur effect works on iOS
          // and provide a subtle top border on all platforms.
          ...Platform.select({
            ios: {
              position: "absolute",
              borderTopColor: theme.colors.outline,
              borderTopWidth: StyleSheet.hairlineWidth,
            },
            default: {
              borderTopColor: theme.colors.outline,
              borderTopWidth: 1,
            },
          }),
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "LNF Highlights",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="sparkles" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="all"
        options={{
          title: "All Bills",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="find-your-rep"
        options={{
          title: "Find Your Rep",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="person.crop.circle.badge.questionmark" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="saved"
        options={{
          title: "Saved",
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="bookmark.fill" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
