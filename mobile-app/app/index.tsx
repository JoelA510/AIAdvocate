// mobile-app/app/index.tsx
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Image, StyleSheet, View, useWindowDimensions } from "react-native";
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
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    // Re-center before animating if safe area / dimensions change
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
  }, [bannerPosition, initialPosition, insets.top, router]);

  return (
    <View style={[styles.container, { backgroundColor: BRAND }]}>
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
          // Keep your original splash asset; change to header-banner.png here if you prefer
          source={require("../assets/images/banner.png")}
          style={styles.banner} // no tint — preserves the asset’s native colors
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, // backgroundColor set inline above
  banner: { width: "100%", height: HEADER_HEIGHT },
});
