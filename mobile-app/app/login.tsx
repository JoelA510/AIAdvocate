import React, { useEffect } from "react";
import { StyleSheet, ActivityIndicator } from "react-native";
import { useTheme } from "react-native-paper"; // Import useTheme from Paper
import { ThemedText } from "../components/ThemedText";
import { ThemedView } from "../components/ThemedView";
import { useAuth } from "../src/providers/AuthProvider";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const theme = useTheme(); // Get the theme from the provider

  useEffect(() => {
    // When the screen loads, automatically trigger the sign-in process.
    // In DEV, this will be instant. In PROD, it will run the full check.
    signIn();
  }, [signIn]);

  return (
    <ThemedView style={styles.container}>
      {/* Use a color from the theme for the activity indicator */}
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <ThemedText type="title">Signing In...</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
  },
});