import React from "react";
import { Text, Platform, Image } from "react-native";
import { Tabs } from "expo-router";
import { useTranslation } from "react-i18next";
import { useTheme } from "react-native-paper";
import HeaderBanner from "../../components/ui/HeaderBanner";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const lnfIcon = require("../../assets/images/LNFmini.png");

type TabLabelProps = {
  focused: boolean;
  color: string;
  position: "beside-icon" | "below-icon";
  children: string;
};

const TabsLayout: React.FC = () => {
  const { t } = useTranslation();
  const theme = useTheme();

  const makeLabel = (label: string) => {
    const TabLabel = ({ color }: TabLabelProps): React.ReactElement => (
      <Text
        style={{ color, fontSize: 12, fontWeight: "500", textTransform: "none" }}
        numberOfLines={1}
      >
        {label}
      </Text>
    );
    TabLabel.displayName = `TabLabel(${label})`;
    return TabLabel;
  };

  return (
    <>
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
            tabBarLabel: makeLabel(t("tabs.highlighted", { defaultValue: "Highlighted" })),
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="star" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="saved"
          options={{
            tabBarLabel: makeLabel(t("tabs.saved", { defaultValue: "Saved" })),
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="bookmark" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            tabBarLabel: makeLabel(t("tabs.bills", { defaultValue: "Bills" })),
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="file-document" color={color} size={size} />
            ),
          }}
        />
        <Tabs.Screen
          name="lnf"
          options={{
            tabBarLabel: makeLabel(t("tabs.lnf", { defaultValue: "LNF" })),
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
            tabBarLabel: makeLabel(t("tabs.advocacy", { defaultValue: "Advocacy" })),
            tabBarIcon: ({ color, size }) => (
              <MaterialCommunityIcons name="bullhorn" color={color} size={size} />
            ),
          }}
        />
      </Tabs>
    </>
  );
};
TabsLayout.displayName = "TabsLayout";

export default TabsLayout;
