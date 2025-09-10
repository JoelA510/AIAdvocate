// mobile-app/app/index.tsx

import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Image, StyleSheet, useWindowDimensions } from "react-native";
import { useTheme } from "react-native-paper";
import { ThemedView } from "../components/ThemedView";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const HEADER_HEIGHT = 50; // The final height of the header banner

export default function SplashScreen() {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  // Compute the starting Y so the banner is vertically centered within the safe area
  const initialPosition = useMemo(() => {
    const safeAreaHeight = screenHeight - insets.top - insets.bottom;
    return insets.top + safeAreaHeight / 2 - HEADER_HEIGHT / 2;
  }, [screenHeight, insets.top, insets.bottom]);

  const bannerPosition = useRef(new Animated.Value(initialPosition)).current;
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    // If safe area / dimensions changed, re-center before animating
    bannerPosition.setValue(initialPosition);

    Animated.timing(bannerPosition, {
      toValue: insets.top,
      duration: 1200,
      useNativeDriver: true,
    }).start(() => {
      if (!hasNavigatedRef.current) {
        hasNavigatedRef.current = true;
        router.replace("/(tabs)");
      }
    });
  }, [bannerPosition, initialPosition, insets.top, router]); // Option A: include what we use

  const bannerTintColor = theme.dark ? "#FFFFFF" : "#000000";

  return (
    <ThemedView style={styles.container}>
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          transform: [{ translateY: bannerPosition }],
        }}
      >
        <Image
          source={require("../assets/images/banner.png")}
          style={[styles.banner, { tintColor: bannerTintColor }]}
          resizeMode="contain"
        />
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  banner: { width: "100%", height: HEADER_HEIGHT },
});
