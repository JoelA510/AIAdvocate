// Native fallback for the admin routes. The real screens live in
// app/admin/*.web.tsx, so staff login (and its email/password collection)
// is bundled only into the web build — the store binaries must stay free
// of email collection to match the Play Data Safety declaration.
import React from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "react-native-paper";
import { useTranslation } from "react-i18next";

export default function AdminWebOnly() {
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <Text variant="titleMedium" style={styles.message}>
        {t("admin.webOnly", "Admin tools are available in the web version of AI Advocate.")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  message: {
    textAlign: "center",
  },
});
