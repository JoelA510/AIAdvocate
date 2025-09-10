// mobile-app/app/(tabs)/language.tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { useTranslation } from "react-i18next";
import { Chip, Divider } from "react-native-paper";
import { Stack } from "expo-router";
import i18n from "../../src/lib/i18n";
import { ThemedView } from "../../components/ThemedView";
import { ThemedText } from "../../components/ThemedText";

const LABELS: Record<string, string> = {
  en: "English",
  es: "Español",
  qps: "Pseudo",
};

export default function LanguageTab() {
  const { i18n: i, t } = useTranslation();

  const supported = (i.options?.supportedLngs as string[] | undefined)?.filter(
    (lng) => lng && lng !== "cimode" && lng !== "dev",
  ) || ["en"];

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: t("tabs.language", { defaultValue: "Language" }),
          headerShown: false,
        }}
      />
      <View style={styles.content}>
        <ThemedText type="title" style={{ marginBottom: 8 }}>
          {t("language.select", { defaultValue: "Select language" })}
        </ThemedText>
        <Divider />
        <View style={styles.row}>
          {supported.map((lng) => {
            const selected = i.language === lng || i.language?.startsWith(lng + "-");
            const label = LABELS[lng] ?? lng.toUpperCase();
            return (
              <Chip
                key={lng}
                selected={selected}
                onPress={() => i18n.changeLanguage(lng)}
                style={styles.chip}
              >
                {label}
              </Chip>
            );
          })}
        </View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 16 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  chip: {},
});
