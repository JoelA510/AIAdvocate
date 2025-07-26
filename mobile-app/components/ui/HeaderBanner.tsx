// mobile-app/src/components/HeaderBanner.tsx

import React from 'react';
import { Image, StyleSheet, useColorScheme, View } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context'; // 1. Import the hook

const HeaderBanner = () => {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets(); // 2. Get the safe area insets

  const bannerTintColor = colorScheme === 'dark' ? theme.colors.primary : theme.colors.onSurface;

  return (
    // 3. Apply the top inset as padding to the container View
    <View style={{ backgroundColor: theme.colors.background, paddingTop: insets.top }}>
      <Image
        source={require('../../assets/images/banner.png')}
        style={[styles.banner, { tintColor: bannerTintColor }]}
        resizeMode="contain"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    height: 50, // This is the height of the image itself
  },
});

export default HeaderBanner;