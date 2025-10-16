import React from "react";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "react-native-paper";

const TabsLayout: React.FC = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const colors = theme.colors as unknown as Record<string, string>;

  return (
    <Tabs
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: "none", backgroundColor: colors.surface },
        tabBarShowLabel: false,
        lazy: true,
      }}
    >
      <Tabs.Screen
        name="active"
        options={{ title: t("tabs.active.label", { defaultValue: "Active" }) }}
      />
      <Tabs.Screen name="saved" options={{ title: t("tabs.saved", { defaultValue: "Saved" }) }} />
      <Tabs.Screen name="index" options={{ title: t("tabs.bills", { defaultValue: "Bills" }) }} />
      <Tabs.Screen name="lnf" options={{ title: t("tabs.lnf", { defaultValue: "LNF" }) }} />
      <Tabs.Screen
        name="advocacy"
        options={{ title: t("tabs.advocacy", { defaultValue: "Advocacy" }) }}
      />
    </Tabs>
  );
};
TabsLayout.displayName = "TabsLayout";

export default TabsLayout;
