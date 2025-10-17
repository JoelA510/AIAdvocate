import React, { useMemo } from "react";
import { View, StyleSheet, Pressable, Image } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { usePathname, useRouter, useSegments, type Href } from "expo-router";
import { PATHS } from "@/lib/paths";

type NavKey = "active" | "saved" | "index" | "lnf" | "advocacy";

type NavItemConfig = {
  key: NavKey;
  route: Href;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  labelKey: string;
  fallback: string;
};

const NAV_ITEMS = [
  {
    key: "active",
    route: "/(tabs)/active",
    icon: "star",
    labelKey: "tabs.active.label",
    fallback: "Active",
  },
  {
    key: "saved",
    route: "/(tabs)/saved",
    icon: "bookmark",
    labelKey: "tabs.saved",
    fallback: "Saved",
  },
  {
    key: "index",
    route: PATHS.HOME as Href,
    icon: "file-document",
    labelKey: "tabs.bills",
    fallback: "Bills",
  },
  {
    key: "lnf",
    route: "/(tabs)/lnf",
    icon: "heart",
    labelKey: "tabs.lnf",
    fallback: "LNF",
  },
  {
    key: "advocacy",
    route: "/(tabs)/advocacy",
    icon: "bullhorn",
    labelKey: "tabs.advocacy",
    fallback: "Advocacy",
  },
] as const satisfies readonly NavItemConfig[];

const KNOWN_KEYS = NAV_ITEMS.reduce<Record<string, true>>((acc, item) => {
  acc[item.key] = true;
  return acc;
}, {});

const LNF_ICON = require("../../assets/images/LNFmini.png");

export default function FooterNav() {
  const { bottom } = useSafeAreaInsets();
  const theme = useTheme();
  const colors = theme.colors as unknown as Record<string, string>;
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const { t } = useTranslation();

  const items = useMemo(
    () =>
      NAV_ITEMS.map((item) => ({
        ...item,
        label: t(item.labelKey, { defaultValue: item.fallback }),
      })),
    [t],
  );

  const activeKey = useMemo<NavKey>(() => {
    if (segments[0] === "(tabs)") {
      const segmentList = segments as string[];
      const candidate = (segmentList[1] ?? "index") as NavKey;
      if (KNOWN_KEYS[candidate]) return candidate;
      return "index";
    }

    if (!segments.length) return "index";

    const primary = segments[0];
    if (primary === "bill" || primary === "legislator") return "index";
    if (primary === "lnf") return "lnf";
    if (primary === "advocacy") return "advocacy";
    if (primary === "saved") return "saved";
    if (primary === "active") return "active";

    if (pathname === "/") {
      return "index";
    }

    return "index";
  }, [pathname, segments]);

  const paddingBottom = Math.max(bottom, 12);

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom,
          backgroundColor: colors.surfaceContainerHigh ?? theme.colors.surface,
          borderTopColor: colors.outlineVariant ?? theme.colors.outline,
          shadowColor: colors.shadow ?? "#000",
        },
      ]}
      accessibilityRole="tablist"
    >
      {items.map((item) => {
        const isActive = item.key === activeKey;
        const iconColor = isActive ? theme.colors.primary : theme.colors.onSurfaceVariant;
        const iconNode =
          item.key === "lnf" ? (
            <Image source={LNF_ICON} style={[styles.lnfIcon, { tintColor: iconColor }]} />
          ) : (
            <MaterialCommunityIcons name={item.icon} size={22} color={iconColor} />
          );

        return (
          <Pressable
            key={item.key}
            style={[styles.item, isActive && styles.itemActive]}
            onPress={() => {
              if (isActive) return;
              router.replace(item.route);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={item.label}
          >
            {iconNode}
            <Text style={[styles.label, { color: iconColor }]} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
  },
  itemActive: {
    opacity: 1,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "none",
    marginTop: 2,
  },
  lnfIcon: {
    width: 22,
    height: 22,
    resizeMode: "contain",
  },
});
