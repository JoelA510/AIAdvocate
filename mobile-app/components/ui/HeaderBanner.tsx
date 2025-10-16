import React, { useMemo, useState } from "react";
import { StyleSheet, View, Image, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter, type Href } from "expo-router";
import { useTheme, Text, IconButton, Menu } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { useAppTheme } from "@/providers/AppThemeProvider";

const BANNER = require("../../assets/images/header-banner.png");
const HEADER_HEIGHT = 50;

type Props = { forceShow?: boolean };

export default function HeaderBanner({ forceShow }: Props) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();
  const theme = useTheme();
  const colors = theme.colors as unknown as Record<string, string>;
  const { t, i18n } = useTranslation();
  const { mode, setMode, resolvedScheme } = useAppTheme();
  const [themeMenuVisible, setThemeMenuVisible] = useState(false);

  // Hide (collapse) on splash route unless forced
  const collapsed = useMemo(() => !forceShow && pathname === "/", [pathname, forceShow]);

  const nextLang = i18n.language === "es" ? "en" : "es";
  const onToggleLang = () => {
    i18n.changeLanguage(nextLang).catch(() => {});
  };

  const themeIcon = resolvedScheme === "dark" ? "weather-night" : "white-balance-sunny";

  const themeOptions = useMemo(
    () =>
      [
        {
          value: "system" as const,
          label: t("theme.mode.system", { defaultValue: "System default" }),
          icon: "theme-light-dark",
        },
        {
          value: "light" as const,
          label: t("theme.mode.light", { defaultValue: "Light" }),
          icon: "white-balance-sunny",
        },
        {
          value: "dark" as const,
          label: t("theme.mode.dark", { defaultValue: "Dark" }),
          icon: "weather-night",
        },
      ] satisfies {
        value: "system" | "light" | "dark";
        label: string;
        icon: string;
      }[],
    [t],
  );

  const handleSelectTheme = (value: "system" | "light" | "dark") => {
    setMode(value);
    setThemeMenuVisible(false);
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
        <View style={styles.left}>
          <Menu
            visible={themeMenuVisible}
            onDismiss={() => setThemeMenuVisible(false)}
            anchor={
              <IconButton
                icon={themeIcon}
                size={22}
                onPress={() => setThemeMenuVisible(true)}
                accessibilityRole="button"
                accessibilityLabel={t("theme.menuLabel", { defaultValue: "Change theme" })}
                selected={mode !== "system"}
                style={{ margin: 0 }}
              />
            }
            anchorPosition="bottom"
          >
            {themeOptions.map((option) => (
              <Menu.Item
                key={option.value}
                onPress={() => handleSelectTheme(option.value)}
                title={option.label}
                leadingIcon={option.icon}
                trailingIcon={mode === option.value ? "check" : undefined}
              />
            ))}
          </Menu>
        </View>
      )}
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
  left: {
    position: "absolute",
    left: 4,
    bottom: 4,
  },
  right: {
    position: "absolute",
    right: 12,
    bottom: 4,
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
