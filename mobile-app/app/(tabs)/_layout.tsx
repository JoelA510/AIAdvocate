// mobile-app/app/(tabs)/_layout.tsx
import React from "react";
import { Text, Platform } from "react-native";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "react-native-paper";
import { IconSymbol } from "../../components/ui/IconSymbol";

export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();

  const labelEl =
    (s: string) =>
    ({ color }: { focused: boolean; color: string }) => (
      <Text
        style={{
          color,
          fontSize: 12,
          fontWeight: "500",
          textTransform: "none", // hard-stop any auto-casing
        }}
        numberOfLines={1}
      >
        {s}
      </Text>
    );

  return (
    <Tabs
      initialRouteName="highlighted"
      screenOptions={{
        headerShown: false, // global banner handles header
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
      {/* 1) Highlighted */}
      <Tabs.Screen
        name="highlighted"
        options={{
          tabBarLabel: labelEl(t("tabs.highlighted", { defaultValue: "Highlighted" })),
          tabBarIcon: ({ color, size }) => <IconSymbol name="star" color={color} size={size} />,
        }}
      />
      {/* 2) Saved */}
      <Tabs.Screen
        name="saved"
        options={{
          tabBarLabel: labelEl(t("tabs.saved", { defaultValue: "Saved" })),
          tabBarIcon: ({ color, size }) => <IconSymbol name="bookmark" color={color} size={size} />,
        }}
      />
      {/* 3) Bills (index.tsx) */}
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: labelEl(t("tabs.bills", { defaultValue: "Bills" })),
          tabBarIcon: ({ color, size }) => <IconSymbol name="doc.text" color={color} size={size} />,
        }}
      />
      {/* 4) LNF */}
      <Tabs.Screen
        name="lnf"
        options={{
          tabBarLabel: labelEl(t("tabs.lnf", { defaultValue: "LNF" })),
          tabBarIcon: ({ color, size }) => <IconSymbol name="bolt" color={color} size={size} />,
        }}
      />
      {/* 5) Advocacy */}
      <Tabs.Screen
        name="advocacy"
        options={{
          tabBarLabel: labelEl(t("tabs.advocacy", { defaultValue: "Advocacy" })),
          tabBarIcon: ({ color, size }) => (
            <IconSymbol name="megaphone" color={color} size={size} />
          ),
        }}
      />
      {/* 6) Language */}
      <Tabs.Screen
        name="language"
        options={{
          tabBarLabel: labelEl(t("tabs.language", { defaultValue: "Language" })),
          tabBarIcon: ({ color, size }) => <IconSymbol name="globe" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
