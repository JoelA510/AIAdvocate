// mobile-app/app/(tabs)/_layout.tsx
import React from "react";
import { Text, Platform, Image } from "react-native";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "react-native-paper";
import HeaderBanner from "../../components/ui/HeaderBanner";
import { MaterialCommunityIcons } from "@expo/vector-icons";

// LNF tab icon: mobile-app/assets/images/LNFmini.png
const lnfIcon = require("../../assets/images/LNFmini.png");

export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();

  const labelEl =
    (s: string) =>
    ({ color }: { focused: boolean; color: string }) => (
      <Text
        style={{ color, fontSize: 12, fontWeight: "500", textTransform: "none" }}
        numberOfLines={1}
      >
        {s}
      </Text>
    );

  return (
    <>
      {/* Force the banner to show on all tabs, including the index/Bills tab */}
      <HeaderBanner forceShow />
      <Tabs
        initialRouteName="highlighted"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.onSurfaceDisabled ?? "#888",
          tabBarLabelStyle: { fontSize: 12, fontWeight: "500", textTransform: "none" },
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
              <MaterialCommunityIcons name="star" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="saved"
          options={{
            tabBarLabel: labelEl(t("tabs.saved", { defaultValue: "Saved" })),
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="bookmark" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            tabBarLabel: labelEl(t("tabs.bills", { defaultValue: "Bills" })),
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="file-document" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="lnf"
          options={{
            tabBarLabel: labelEl(t("tabs.lnf", { defaultValue: "LNF" })),
            // Use image + tintColor so it behaves like other icons
            tabBarIcon: ({ color, size }) => (
              <Image
                source={lnfIcon}
                style={{ width: size, height: size, tintColor: color }}
                resizeMode="contain"
              />
            ),
          }}
        />
        <Tabs.Screen
          name="advocacy"
          options={{
            tabBarLabel: labelEl(t("tabs.advocacy", { defaultValue: "Advocacy" })),
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="bullhorn" color={color} size={size} />
            ),
          }}
        />

        {/* Explicitly register the Language route and hide it from the tab bar */}
        <Tabs.Screen
          name="language"
          options={{
            tabBarButton: () => null, // hide from UI (do not combine with href: null)
          }}
        />
      </Tabs>
    </>
  );
}
