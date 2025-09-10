import React from "react";
import { Image, StyleSheet } from "react-native";
import { useTheme } from "react-native-paper";

const LnfIcon = () => {
  const theme = useTheme();
  const iconColor = theme.dark ? theme.colors.primary : theme.colors.onSurface;

  return (
    <Image
      source={require("../../assets/images/adaptive-icon.png")}
      style={[styles.icon, { tintColor: iconColor }]}
    />
  );
};

const styles = StyleSheet.create({
  icon: {
    width: 28,
    height: 28,
  },
});

export default LnfIcon;
