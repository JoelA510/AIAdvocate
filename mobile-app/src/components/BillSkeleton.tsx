import React from "react";
import { StyleSheet, View } from "react-native";

import { ThemedView } from "@/components/ThemedView";
import { useThemeColor } from "@/hooks/useThemeColor";

export default function BillSkeleton() {
  const placeholderColor = useThemeColor(
    { light: "#e0e0e0", dark: "#3a3a3a" },
    "background",
  );

  return (
    <ThemedView style={styles.billContainer}>
      <View style={[styles.placeholder, { backgroundColor: placeholderColor, width: "50%", height: 24 }]} />
      <View style={[styles.placeholder, { backgroundColor: placeholderColor, width: "90%", marginTop: 12 }]} />
      <View style={[styles.placeholder, { backgroundColor: placeholderColor, width: "70%", marginTop: 8 }]} />
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
    marginBottom: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
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
    borderRadius: 5,
  },
});