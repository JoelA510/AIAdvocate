import { StyleSheet, Text, type TextProps } from "react-native";
import { useTheme } from "react-native-paper";

// We remove lightColor and darkColor props.
export type ThemedTextProps = TextProps & {
  type?: "default" | "title" | "defaultSemiBold" | "subtitle" | "link";
};

export function ThemedText({ style, type = "default", ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const bodyFont = theme.fonts.bodyMedium.fontFamily;
  const titleFont = theme.fonts.titleLarge.fontFamily;

  return (
    <Text
      style={[
        // Use the theme's default text color for surfaces.
        { color: theme.colors.onSurface, fontFamily: bodyFont },
        type === "default" ? styles.default : undefined,
        type === "title" ? [styles.title, { fontFamily: titleFont }] : undefined,
        type === "defaultSemiBold" ? styles.defaultSemiBold : undefined,
        type === "subtitle" ? styles.subtitle : undefined,
        // Use the theme's primary color for links for consistency.
        type === "link" ? [styles.link, { color: theme.colors.primary }] : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
  },
  defaultSemiBold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  link: {
    lineHeight: 30,
    fontSize: 16,
  },
});
