// mobile-app/app/index.tsx
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const HEADER_HEIGHT = 50; // Final height of the header banner
const BRAND = "#078A97"; // Same brand color as your banner

export default function SplashScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  // Start vertically centered within the safe area
  const initialPosition = useMemo(() => {
    const safeAreaHeight = screenHeight - insets.top - insets.bottom;
    return insets.top + safeAreaHeight / 2 - HEADER_HEIGHT / 2;
  }, [screenHeight, insets.top, insets.bottom]);

  const bannerPosition = useRef(new Animated.Value(initialPosition)).current;
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const bannerScale = useRef(new Animated.Value(1.05)).current;
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    // Re-center before animating if safe area / dimensions change
    bannerPosition.setValue(initialPosition);
    bannerOpacity.setValue(0);
    bannerScale.setValue(1.05);

    Animated.parallel([
      Animated.timing(bannerPosition, {
        toValue: insets.top,
        duration: 1100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(bannerOpacity, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(bannerScale, {
        toValue: 1,
        duration: 900,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (!hasNavigatedRef.current) {
        hasNavigatedRef.current = true;
        router.replace("/(tabs)");
      }
    });
  }, [bannerPosition, bannerOpacity, bannerScale, initialPosition, insets.top, router]);

  return (
    <View style={[styles.container, { backgroundColor: BRAND }]}>
      <Animated.Image
        source={require("../assets/images/banner.png")}
        resizeMode="contain"
        style={[
          styles.banner,
          {
            transform: [{ translateY: bannerPosition }, { scale: bannerScale }],
            opacity: bannerOpacity,
          } as any,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  banner: { width: "80%", maxWidth: 480, height: HEADER_HEIGHT },
});
