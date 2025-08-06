// mobile-app/app/index.tsx

import { useRouter } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Image, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper'; // Import the useTheme hook
import { ThemedView } from '../components/ThemedView'; // Import ThemedView

const HEADER_HEIGHT = 50; // The final height of the header banner

export default function SplashScreen() {
  const router = useRouter();
  const theme = useTheme(); // Get the current theme
  const screenHeight = Dimensions.get('window').height;
  const initialPosition = (screenHeight / 2) - (HEADER_HEIGHT / 2);

  const bannerPosition = useRef(new Animated.Value(initialPosition)).current;

  useEffect(() => {
    Animated.timing(bannerPosition, {
      toValue: 0, 
      duration: 1200,
      useNativeDriver: true,
    }).start(() => {
      router.replace('/(tabs)');
    });
  }, []);

  // Determine banner color based on the theme
  const bannerTintColor = theme.dark ? '#FFFFFF' : '#000000';

  return (
    // Use ThemedView as the main container to get the correct background color
    <ThemedView style={styles.container}>
      <Animated.View style={{ transform: [{ translateY: bannerPosition }] }}>
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