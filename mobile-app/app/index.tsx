// mobile-app/app/index.tsx

import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Image, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { ThemedView } from '../components/ThemedView';
// --- NEW: Import the hook to get safe area dimensions ---
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HEADER_HEIGHT = 50; // The final height of the header banner

export default function SplashScreen() {
  const router = useRouter();
  const theme = useTheme();
  // --- NEW: Get the safe area dimensions for the current device ---
  const insets = useSafeAreaInsets();

  const screenHeight = Dimensions.get('window').height;
  
  // --- CORRECTED: Calculate the visual center within the safe area ---
  const safeAreaHeight = screenHeight - insets.top - insets.bottom;
  const initialPosition = insets.top + (safeAreaHeight / 2) - (HEADER_HEIGHT / 2);

  const bannerPosition = useRef(new Animated.Value(initialPosition)).current;

  useEffect(() => {
    Animated.timing(bannerPosition, {
      // --- THE FIX: Animate to the top inset, not to 0 ---
      toValue: insets.top, 
      duration: 1200,
      useNativeDriver: true, // Use the native thread for a smoother animation
    }).start(() => {
      // This callback runs after the animation is complete
      router.replace('/(tabs)');
    });
  }, []);

  const bannerTintColor = theme.dark ? '#FFFFFF' : '#000000';

  return (
    <ThemedView style={styles.container}>
      <Animated.View style={{ 
        // Use an absolute position for animations over a static background
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        transform: [{ translateY: bannerPosition }] 
      }}>
        <Image
          source={require('../assets/images/banner.png')}
          style={[styles.banner, { tintColor: bannerTintColor }]}
          resizeMode="contain"
        />
      </Animated.View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  banner: {
    width: '100%',
    height: HEADER_HEIGHT,
  },
});