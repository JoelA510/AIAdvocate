// Native fallback for the admin routes. The real screens live in
// src/features/admin/*.web.tsx; Metro resolves these sibling stubs on
// iOS/Android so staff login (and its email/password collection) is
// bundled only into the web build — the store binaries must stay free
// of email collection to match the Play Data Safety declaration.
//
// Do NOT put platform forks in app/admin/ itself: expo-router bundles
// every file under app/ on every platform regardless of .web suffixes
// (see DEPLOYMENT_GUIDE.md, "Play Data Safety — email collection").
import React from "react";
import { StyleSheet } from "react-native";
import { Button } from "react-native-paper";
import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";

import { ThemedView } from "../../components/ThemedView";
import EmptyState from "./EmptyState";

export default function AdminWebOnly() {
  const { t } = useTranslation();
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  return (
    <ThemedView style={styles.container}>
      <EmptyState
        icon="person.crop.circle.badge.exclamationmark"
        title={t("admin.title", "Admin")}
        message={t("admin.webOnly", "Admin tools are available in the web version of AI Advocate.")}
      />
      <Button mode="text" onPress={goBack} style={styles.backButton}>
        {t("common.back", "Back")}
      </Button>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backButton: {
    alignSelf: "center",
    marginBottom: 24,
  },
});
