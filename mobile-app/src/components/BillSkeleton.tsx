import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "react-native-paper";

import { ThemedView } from "../../components/ThemedView";

export default function BillSkeleton() {
  const theme = useTheme(); // Get the theme

  // Use a color from the theme for the placeholder elements
  const placeholderColor = theme.colors.surfaceVariant;

  return (
    // ThemedView will now handle its own background automatically.
    // The border color is also updated to use the theme.
    <ThemedView
      style={[
        styles.billContainer,
        {
          backgroundColor: theme.colors.surfaceContainerLowest,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
    >
      <View
        style={[
          styles.placeholder,
          { backgroundColor: placeholderColor, width: "50%", height: 24 },
        ]}
      />
      <View
        style={[
          styles.placeholder,
          { backgroundColor: placeholderColor, width: "90%", marginTop: 12 },
        ]}
      />
      <View
        style={[
          styles.placeholder,
          { backgroundColor: placeholderColor, width: "70%", marginTop: 8 },
        ]}
      />
      <View style={styles.toolbar}>
        <View style={[styles.placeholderButton, { backgroundColor: placeholderColor }]} />
        <View style={[styles.placeholderButton, { backgroundColor: placeholderColor }]} />
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
    height: 20,
    borderRadius: 4,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginTop: 20,
    gap: 8,
  },
  placeholderButton: {
    height: 36,
    width: "22%",
    borderRadius: 20, // Rounded to match Paper's Button
  },
});
