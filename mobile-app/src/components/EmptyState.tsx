import React from "react";
import { StyleSheet } from "react-native";
import { useTheme } from "react-native-paper"; // Import useTheme

import { ThemedText } from "../../components/ThemedText";
import { ThemedView } from "../../components/ThemedView";
import { IconSymbol } from "../../components/ui/IconSymbol";

type EmptyStateProps = {
  icon: React.ComponentProps<typeof IconSymbol>["name"];
  title: string;
  message: string;
};

export default function EmptyState({ icon, title, message }: EmptyStateProps) {
  const theme = useTheme(); // Get the theme

  // Use a muted color from the theme for the icon and message text
  const mutedColor = theme.colors.onSurfaceDisabled;

  return (
    <ThemedView style={styles.container}>
      <IconSymbol name={icon} size={80} color={mutedColor} />
      <ThemedText type="title" style={styles.title}>
        {title}
      </ThemedText>
      <ThemedText type="default" style={[styles.message, { color: mutedColor }]}>
        {message}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
    gap: 16,
  },
  title: {
    textAlign: "center",
  },
  message: {
    textAlign: "center",
  },
});
