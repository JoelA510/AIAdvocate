import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import { ThemedText } from "../components/ThemedText";
import { ThemedView } from "../components/ThemedView";
import { useAuth } from "../src/providers/AuthProvider";

export default function LoginScreen() {
  const { signIn } = useAuth();

  useEffect(() => {
    signIn();
  }, [signIn]);

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Verifying you're human...</ThemedText>
      <ThemedText style={styles.subtitle}>
        Please wait while we verify your device.
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
