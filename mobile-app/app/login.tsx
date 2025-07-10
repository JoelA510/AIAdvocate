import React, { useEffect } from "react";
import { StyleSheet, ActivityIndicator } from "react-native";
import { ThemedText } from "../components/ThemedText";
import { ThemedView } from "../components/ThemedView";
import { useAuth } from "../src/providers/AuthProvider";
import { useThemeColor } from "../hooks/useThemeColor";

export default function LoginScreen() {
  const { signIn } = useAuth();

  useEffect(() => {
    // Automatically trigger the sign-in process when the screen loads
    signIn();
  }, [signIn]);

  const tint = useThemeColor({}, "tint");

  return (
    <ThemedView style={styles.container}>
      <ActivityIndicator size="large" color={tint} />
      <ThemedText type="title">Verifying Device...</TheThemedText>
      <ThemedText style={styles.subtitle}>
        Please wait while we securely verify your app.
      </ThemedText>
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
  subtitle: {
    color: "#666",
    textAlign: "center",
    paddingHorizontal: 20,
  },
});