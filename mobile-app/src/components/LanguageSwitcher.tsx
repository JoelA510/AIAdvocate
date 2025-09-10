// mobile-app/src/components/LanguageSwitcher.tsx
import React from "react";
import { View, StyleSheet } from "react-native";
import { Chip } from "react-native-paper";
import { useTranslation } from "react-i18next";
import i18n from "../lib/i18n";

const LABELS: Record<string, string> = {
  en: "English",
  es: "Español",
  qps: "Pseudo",
};

export default function LanguageSwitcher() {
  const { i18n: i } = useTranslation();

  // Prefer the declared supported list; fall back to the languages i18next knows about.
  const rawList = (i.options?.supportedLngs as string[] | undefined)?.filter(
    (lng) => lng && lng !== "cimode" && lng !== "dev",
  ) ||
    i.languages || ["en"];

  // Hide qps in prod; i18n.ts only includes qps when __DEV__ && EXPO_PUBLIC_SHOW_PSEUDO=1, so this is redundant safety
  const items = rawList.filter((lng) => lng !== "qps" || __DEV__);

  if (!items.length) return null;

  return (
    <View style={styles.wrap}>
      {items.map((lng) => {
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
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, padding: 12 },
  chip: {},
});
