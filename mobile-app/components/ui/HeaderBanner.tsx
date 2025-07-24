import React from 'react';
import { Image, StyleSheet, useColorScheme, View } from 'react-native';
import { useTheme } from 'react-native-paper';

const HeaderBanner = () => {
  const theme = useTheme();
  const colorScheme = useColorScheme();

  const bannerTintColor = colorScheme === 'dark' ? theme.colors.primary : theme.colors.onSurface;

  return (
    <View style={{ backgroundColor: theme.colors.background }}>
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
    height: 50,
  },
});

export default HeaderBanner;
