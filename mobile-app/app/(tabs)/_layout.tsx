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

type TabLabelProps = { focused: boolean; color: string };

const createTabLabel = (text: string) => {
  const render = ({ color }: TabLabelProps) => (
    <Text
      style={{ color, fontSize: 12, fontWeight: "500", textTransform: "none" }}
      numberOfLines={1}
    >
      {text}
    </Text>
  );

  Object.assign(render, { displayName: `TabLabel(${text})` });
  return render;
};

const TabsLayout: React.FC = () => {
  const { t } = useTranslation();
  const theme = useTheme();

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
            tabBarLabel: createTabLabel(t("tabs.highlighted", { defaultValue: "Highlighted" })),
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="star" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="saved"
          options={{
            tabBarLabel: createTabLabel(t("tabs.saved", { defaultValue: "Saved" })),
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="bookmark" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            tabBarLabel: createTabLabel(t("tabs.bills", { defaultValue: "Bills" })),
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="file-document" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="lnf"
          options={{
            tabBarLabel: createTabLabel(t("tabs.lnf", { defaultValue: "LNF" })),
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
            tabBarLabel: createTabLabel(t("tabs.advocacy", { defaultValue: "Advocacy" })),
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
};

TabsLayout.displayName = "TabsLayout";

export default TabsLayout;
