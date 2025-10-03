import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Image, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColorScheme } from "../hooks/useColorScheme";

const BANNER = require("../assets/images/header-banner.png");
const LOGO_ASPECT_RATIO = 1500 / 257;

export default function EntryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { width: screenWidth } = useWindowDimensions();
  const resolvedWidth = screenWidth > 0 ? screenWidth : 360;
  const logoWidth = Math.min(resolvedWidth * 0.7, 360);
  const logoHeight = logoWidth / LOGO_ASPECT_RATIO;

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/(tabs)");
    }, 20);
    return () => clearTimeout(timer);
  }, [router]);

  const backgroundColor = colorScheme === "dark" ? "#0b0b0b" : "#ffffff";

  return (
    <View
      style={[
        styles.container,
        { backgroundColor, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <Image
        source={BANNER}
        resizeMode="contain"
        style={{ width: logoWidth, height: logoHeight }}
        accessibilityRole="image"
        accessibilityLabel="AI Advocate"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
