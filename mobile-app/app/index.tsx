import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColorScheme } from "../hooks/useColorScheme";

const BANNER = require("../assets/images/header-banner.png");

export default function EntryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();

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
        style={styles.logo}
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
  logo: {
    width: "70%",
    maxWidth: 360,
    aspectRatio: 3,
  },
});
