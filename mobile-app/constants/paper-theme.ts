import { MD3LightTheme, MD3DarkTheme, configureFonts } from "react-native-paper";

// Map MD3 type tokens to your font family.
// Make sure the font is loaded with the same key in app/_layout.tsx.
const fontConfig = {
  displayLarge: { fontFamily: "SpaceMono-Regular" },
  displayMedium: { fontFamily: "SpaceMono-Regular" },
  headlineLarge: { fontFamily: "SpaceMono-Regular" },
  headlineMedium: { fontFamily: "SpaceMono-Regular" },
  titleLarge: { fontFamily: "SpaceMono-Regular" },
  titleMedium: { fontFamily: "SpaceMono-Regular" },
  bodyLarge: { fontFamily: "SpaceMono-Regular" },
  bodyMedium: { fontFamily: "SpaceMono-Regular" },
  labelLarge: { fontFamily: "SpaceMono-Regular" },
};

export const LightTheme = {
  ...MD3LightTheme,
  fonts: configureFonts({ config: fontConfig }),
  colors: {
    ...MD3LightTheme.colors,
    primary: "#0a7ea4",
  },
};

export const DarkTheme = {
  ...MD3DarkTheme,
  fonts: configureFonts({ config: fontConfig }),
  colors: {
    ...MD3DarkTheme.colors,
    primary: "#ffffff",
  },
};
