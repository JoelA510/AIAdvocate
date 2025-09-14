// mobile-app/components/ui/HeaderBanner.tsx (modified)

import React, { useEffect } from "react";
import { StyleSheet, Image, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname } from "expo-router";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { ThemedView } from "../ThemedView";
import LanguageMenuButton from "./LanguageMenuButton";

// Path to the banner asset. Update if your asset location changes.
const bannerSource = require("../../assets/images/header-banner.png");

// ensure only one animation per app run
let hasAnimatedOnce = false;

/**
 * HeaderBanner renders a small banner at the top of every screen.  It slides
 * gently into place on first render and includes a floating language selector
 * anchored to the top right.  When the pathname is "/" (splash), the header
 * returns null so that the animated splash banner is shown by itself.
 */
export default function HeaderBanner() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  // Hide the global header when we are on the root splash screen.  The
  // animated splash (app/index.tsx) already displays the banner.
  if (pathname === "/") {
    return null;
  }

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
  }, [progress]);

  return (
    <ThemedView style={[styles.wrap, { paddingTop: insets.top }]}>
      {/* Slide-in banner */}
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
      {/* Floating language selector anchored to the top right */}
      <LanguageMenuButton />
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
