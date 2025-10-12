import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "react-native-paper";

import { ThemedView } from "../../components/ThemedView";

export default function BillSkeleton() {
  const theme = useTheme();
  const colors = theme.colors as unknown as Record<string, string>;
  const placeholderColor = theme.colors.surfaceVariant;

  return (
    <ThemedView
      style={[
        styles.billContainer,
        {
          backgroundColor: colors.surfaceContainerLowest ?? theme.colors.surface,
          borderColor: colors.outlineVariant ?? theme.colors.outline,
          shadowColor: colors.shadow ?? "#000",
        },
      ]}
    >
      <View
        style={[
          styles.placeholder,
          { backgroundColor: placeholderColor, width: "45%", height: 24 },
        ]}
      />
      <View
        style={[
          styles.placeholder,
          { backgroundColor: placeholderColor, width: "90%", marginTop: 10, height: 18 },
        ]}
      />
      <View
        style={[
          styles.placeholder,
          { backgroundColor: placeholderColor, width: "70%", marginTop: 8, height: 16 },
        ]}
      />
      <View style={styles.toolbar}>
        <View style={[styles.placeholderButton, { backgroundColor: placeholderColor }]} />
        <View style={[styles.placeholderButton, { backgroundColor: placeholderColor }]} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  billContainer: {
    marginBottom: 18,
    padding: 20,
    borderWidth: 1,
    borderRadius: 24,
    gap: 12,
  },
  placeholder: {
    borderRadius: 6,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "flex-start",
    marginTop: 18,
    gap: 12,
  },
  placeholderButton: {
    height: 36,
    width: 96,
    borderRadius: 20,
  },
});
