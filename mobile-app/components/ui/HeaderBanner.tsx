import React, { useMemo } from "react";
import { StyleSheet, View, Image, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter, type Href } from "expo-router";
import { useTheme, Text } from "react-native-paper";
import { useTranslation } from "react-i18next";

const BANNER = require("../../assets/images/header-banner.png");
const HEADER_HEIGHT = 50;

type Props = { forceShow?: boolean };

export default function HeaderBanner({ forceShow }: Props) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const colors = theme.colors as unknown as Record<string, string>;
  const { i18n } = useTranslation();

  // Hide (collapse) on splash route unless forced
  const collapsed = useMemo(() => !forceShow && pathname === "/", [pathname, forceShow]);

  const nextLang = i18n.language === "es" ? "en" : "es";
  const onToggleLang = () => {
    i18n.changeLanguage(nextLang).catch(() => {});
  };

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingTop: insets.top,
          height: collapsed ? insets.top : insets.top + HEADER_HEIGHT,
          backgroundColor: colors.surfaceContainerHigh ?? theme.colors.surface,
          borderBottomColor: colors.outlineVariant ?? theme.colors.outline,
          shadowColor: colors.shadow ?? "#000",
        },
      ]}
    >
      {!collapsed && (
        <TouchableOpacity
          onPress={() => router.navigate("/" as Href)}
          style={styles.bannerTouchable}
          accessibilityRole="button"
          accessibilityLabel="AI Advocate home"
          activeOpacity={0.85}
        >
          <Image
            source={BANNER}
            resizeMode="contain"
            style={[styles.banner, { tintColor: undefined }]}
          />
        </TouchableOpacity>
      )}

      {!collapsed && (
        <View style={styles.right}>
          <TouchableOpacity
            onPress={onToggleLang}
            style={[styles.langButton, { backgroundColor: theme.colors.primary }]}
            accessibilityRole="button"
            activeOpacity={0.85}
          >
            <Text style={{ color: theme.colors.onPrimary, fontWeight: "600" }}>
              {i18n.language === "es" ? "ES" : "EN"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: "flex-end",
    paddingHorizontal: 16,
  },
  banner: {
    width: "100%",
    height: HEADER_HEIGHT,
  },
  bannerTouchable: {
    width: "100%",
  },
  right: {
    position: "absolute",
    right: 12,
    bottom: 8,
    height: 34,
    justifyContent: "center",
    alignItems: "center",
  },
  langButton: {
    minWidth: 44,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
});
