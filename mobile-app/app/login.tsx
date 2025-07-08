import HCaptcha from "@hcaptcha/react-native-hcaptcha";
import React from "react";
import { StyleSheet } from "react-native";
import { ThemedText } from "../components/ThemedText";
import { ThemedView } from "../components/ThemedView";
import { useAuth } from "../src/providers/AuthProvider";

const HCAPTCHA_SITE_KEY = process.env.EXPO_PUBLIC_HCAPTCHA_SITE_KEY;

export default function LoginScreen() {
  const { signInWithCaptcha } = useAuth();

  console.log("hCaptcha Component is rendering with Sitekey:", HCAPTCHA_SITE_KEY);

  const handleMessage = (event: any) => {
    if (event && event.nativeEvent.data) {
      if (["cancel", "error", "expired"].includes(event.nativeEvent.data)) {
        console.warn("hCaptcha event:", event.nativeEvent.data);
      } else {
        const token = event.nativeEvent.data;
        console.log("hCaptcha token received, attempting sign-in...");
        signInWithCaptcha(token);
      }
    }
  };

  const handleError = (error: any) => {
    console.error("!!! hCaptcha Component Error:", error);
  };

  if (!HCAPTCHA_SITE_KEY) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={{ color: "red" }}>
          Configuration Error
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          hCaptcha Site Key is missing. Please check your .env file.
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title">Verifying you're human...</ThemedText>
      <ThemedText style={styles.subtitle}>
        Please complete the check below to continue.
      </ThemedText>
      <HCaptcha
        siteKey={HCAPTCHA_SITE_KEY}
        onMessage={handleMessage}
        onError={handleError}
        style={{ width: 320, height: 400 }}
        showLoading
        loadingIndicatorColor="#0a7ea4"
        // The baseUrl and originWhitelist are not needed for the default behavior to work
        // on a properly configured development build.
      />
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