import React, { useEffect } from "react";
import { StyleSheet, ActivityIndicator } from "react-native";
import { ThemedText } from "../components/ThemedText";
import { ThemedView } from "../components/ThemedView";
import { useAuth } from "../src/providers/AuthProvider";
import { useThemeColor } from "../hooks/useThemeColor";

export default function LoginScreen() {
  const { signIn } = useAuth();

  useEffect(() => {
    // When the screen loads, automatically trigger the sign-in process.
    // In DEV, this will be instant. In PROD, it will run the full check.
    signIn();
  }, [signIn]);

  const tint = useThemeColor({}, "tint");

  return (
    <ThemedView style={styles.container}>
      <ActivityIndicator size="large" color={tint} />
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