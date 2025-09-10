// mobile-app/components/ui/HeaderBanner.tsx
import React, { useEffect } from "react";
import { StyleSheet, Image, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { ThemedView } from "../ThemedView";

// Update this path to your real asset if different
const bannerSource = require("../../assets/images/header-banner.png");

// ensure only one animation per app run
let hasAnimatedOnce = false;

export default function HeaderBanner() {
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(hasAnimatedOnce ? 1 : 0);

  const styleA = useAnimatedStyle(() => {
    const translateY = (1 - progress.value) * 24; // gentle slide up
    const opacity = progress.value < 0.05 ? 0 : 1;
    return { transform: [{ translateY }], opacity };
  });

  useEffect(() => {
    if (hasAnimatedOnce) return;
    progress.value = withTiming(1, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
    hasAnimatedOnce = true;
  }, [progress]); // ← add progress to deps

  return (
    <ThemedView style={[styles.wrap, { paddingTop: insets.top }]}>
      <Animated.View
        style={[
          styleA,
          Platform.select({
            web: { position: "relative" },
            default: { position: "relative" },
          }),
        ]}
      >
        <Image
          source={bannerSource}
          resizeMode="contain"
          style={styles.bannerImage}
          accessibilityRole="image"
          accessibilityLabel="AI Advocate"
        />
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  bannerImage: {
    width: "100%",
    height: 48,
  },
});
