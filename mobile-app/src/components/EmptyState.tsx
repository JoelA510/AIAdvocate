import React from "react";
import { StyleSheet } from "react-native";

import { ThemedText } from "../../components/ThemedText";
import { ThemedView } from "../../components/ThemedView";
import { IconSymbol } from "../../components/ui/IconSymbol";
import { useThemeColor } from "../../hooks/useThemeColor";

type EmptyStateProps = {
  icon: React.ComponentProps<typeof IconSymbol>["name"];
  title: string;
  message: string;
};

export default function EmptyState({ icon, title, message }: EmptyStateProps) {
  const iconColor = useThemeColor({ light: "#a0a0a0", dark: "#606060" }, "text");

  return (
    <ThemedView style={styles.container}>
      <IconSymbol name={icon} size={80} color={iconColor} />
      <ThemedText type="title" style={styles.title}>
        {title}
      </ThemedText>
      <ThemedText type="default" style={styles.message}>
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
    color: "#888",
  },
});