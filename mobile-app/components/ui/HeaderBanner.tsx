import React, { useEffect, useRef } from "react";
import { Animated, Image, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, usePathname } from "expo-router";
import { useTheme } from "react-native-paper";
import { MaterialCommunityIcons } from "@expo/vector-icons";

const banner = require("../../assets/images/header-banner.png");

type Props = { forceShow?: boolean };

export default function HeaderBanner({ forceShow }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();

  const isOnSplash = pathname === "/" || pathname === "/index";
  const visible = forceShow ? true : !isOnSplash;

  const slide = useRef(new Animated.Value(-20)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [visible, slide, fade]);

  if (!visible) return null;

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: theme.colors.background }}>
      <Animated.View
        style={[
          styles.row,
          {
            transform: [{ translateY: slide }],
            opacity: fade,
            borderBottomColor: theme.colors.surfaceVariant,
          },
        ]}
      >
        <Image source={banner} style={styles.banner} resizeMode="contain" />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/language")}
          style={({ pressed }) => [
            styles.langBtn,
            {
              opacity: pressed ? 0.7 : 1,
              backgroundColor: theme.colors.elevation?.level2 ?? "transparent",
            },
          ]}
        >
          <MaterialCommunityIcons name="translate" size={18} color={theme.colors.primary} />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 50,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    alignItems: "center",
  },
  banner: { flex: 1, height: 32 },
  langBtn: {
    height: 28,
    minWidth: 28,
    marginLeft: 8,
    paddingHorizontal: 6,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
});
