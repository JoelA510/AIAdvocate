import { View, type ViewProps } from "react-native";
import { useTheme } from "react-native-paper";

// We remove the lightColor and darkColor props as they are no longer needed.
export type ThemedViewProps = ViewProps;

export function ThemedView({ style, ...otherProps }: ThemedViewProps) {
  // Get the theme from the PaperProvider context.
  const theme = useTheme();

  return <View style={[{ backgroundColor: theme.colors.background }, style]} {...otherProps} />;
}
