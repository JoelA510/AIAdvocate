
import { Tabs } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "react-native-paper";
import { HapticTab } from "../../components/HapticTab";
import TabBarBackground from "../../components/ui/TabBarBackground";
import { IconSymbol } from "../../components/ui/IconSymbol";
import LnfIcon from "../../components/ui/LnfIcon";

export default function TabLayout() {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
        },
        tabBarActiveTintColor: theme.colors.primary,
      }}
    >
      <Tabs.Screen
        name="saved"
        options={{
          title: t("tabs.saved"),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="bookmark.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="highlighted"
        options={{
          title: t("tabs.highlighted"),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="sparkles" color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: t("tabs.bills"),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="lnf"
        options={{
          title: t("tabs.lnf"),
          tabBarIcon: () => <LnfIcon />,
        }}
      />
      <Tabs.Screen
        name="advocacy"
        options={{
          title: t("tabs.advocacy"),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="person.2.fill" color={color} />,
        }}
      />
    </Tabs>
  );
}
