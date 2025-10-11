/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

export const BrandPalette = {
  /** Core teal pulled from the Love Never Fails / AI Advocate wordmark */
  primary: "#008C95",
  /** Brighter teal used for active states and gradients */
  primaryBright: "#00A7B2",
  /** Darkened teal for contrast-rich surfaces */
  primaryMuted: "#0B6169",
  /** Deep navy accent leveraged for dark mode and typography */
  midnight: "#00171D",
  /** Foam white with a teal cast for backgrounds */
  foam: "#F1FBFC",
  /** Misty teal used for containers and cards */
  mist: "#D7F1F3",
  /** Golden accent taken from Love Never Fails campaign collateral */
  sunrise: "#F6B756",
  /** Softer golden container */
  sunriseSoft: "#FFE0A3",
  /** Neutral for text on teal surfaces */
  onPrimary: "#FFFFFF",
  onPrimaryMuted: "#002F33",
  onSurface: "#06252A",
  onSurfaceVariant: "#3D5A5E",
  outline: "#5A7C80",
  outlineVariant: "#C1E4E7",
  midnightSurface: "#021C21",
  midnightRaised: "#062E33",
  skyHighlight: "#72D8DD",
  glacier: "#8FDDE3",
  onSunrise: "#2F1600",
};

export const Colors = {
  light: {
    text: BrandPalette.onSurface,
    background: BrandPalette.foam,
    surface: "#F8FCFD",
    surfaceAlt: BrandPalette.mist,
    tint: BrandPalette.primary,
    icon: BrandPalette.onSurfaceVariant,
    tabIconDefault: BrandPalette.onSurfaceVariant,
    tabIconSelected: BrandPalette.primary,
  },
  dark: {
    text: "#C6E8EB",
    background: BrandPalette.midnight,
    surface: BrandPalette.midnightSurface,
    surfaceAlt: BrandPalette.midnightRaised,
    tint: BrandPalette.skyHighlight,
    icon: BrandPalette.glacier,
    tabIconDefault: BrandPalette.glacier,
    tabIconSelected: BrandPalette.skyHighlight,
  },
};
