import { MD3LightTheme, MD3DarkTheme } from "react-native-paper";

// Define a custom font configuration if needed, or use the default
const fontConfig = {
  fontFamily: "System",
};

export const LightTheme = {
  ...MD3LightTheme,
  fonts: {
    ...MD3LightTheme.fonts,
    // You can override specific font styles here
    // default: { ...MD3LightTheme.fonts.default, fontFamily: fontConfig.fontFamily },
  },
  // You can also add custom colors here
  colors: {
    ...MD3LightTheme.colors,
    primary: "#0a7ea4",
    accent: "#c7e0f4",
  },
};

export const DarkTheme = {
  ...MD3DarkTheme,
  fonts: {
    ...MD3DarkTheme.fonts,
    // default: { ...MD3DarkTheme.fonts.default, fontFamily: fontConfig.fontFamily },
  },
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#ffffff",
    accent: "#3a3a3a",
  },
};