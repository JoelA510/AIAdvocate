// mobile-app/src/components/SummarySlider.tsx
// Replaces external slider dep with Paper SegmentedButtons (no new packages).

import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text, useTheme, SegmentedButtons } from "react-native-paper";
import { useTranslation } from "react-i18next";
import { Bill } from "./Bill";

type Props = {
  bill: Bill;
  onSummaryChange: (text: string) => void;
};

type Level = "simple" | "medium" | "complex" | "original";

export default function SummarySlider({ bill, onSummaryChange }: Props) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();

  const LABELS = useMemo(
    () => ({
      simple: t("summary.level.simple", "Simple"),
      medium: t("summary.level.medium", "Medium"),
      complex: t("summary.level.complex", "Complex"),
      original: t("summary.level.original", "Original Text"),
    }),
    [t],
  );

  const [level, setLevel] = useState<Level>("simple");

  const getSummaryForLevel = (lvl: Level) => {
    const lang = i18n.language ?? "en";
    const choose = (en?: string | null, es?: string | null) =>
      lang.startsWith("es") && es ? es : en;

    const textByLevel: Record<Level, string | null | undefined> = {
      simple: choose(bill.summary_simple, (bill as any).summary_simple_es),
      medium: choose(bill.summary_medium, (bill as any).summary_medium_es),
      complex: choose(bill.summary_complex, (bill as any).summary_complex_es),
      original: bill.original_text,
    };

    // If content exists for the requested level, return it.
    if (textByLevel[lvl]) return textByLevel[lvl];

    // Fallback logic
    const fallbacks: Record<Level, Level[]> = {
      simple: ["medium", "complex", "original"],
      medium: ["simple", "complex", "original"],
      complex: ["medium", "simple", "original"],
      original: ["complex", "medium", "simple"],
    };

    for (const fallbackLevel of fallbacks[lvl]) {
      const fallbackText = textByLevel[fallbackLevel];
      if (fallbackText) {
        const fallbackLabel = LABELS[fallbackLevel];
        return t("summary.fallback", "({{label}} summary used; {{target}} is not available.)\n\n{{text}}", {
          label: fallbackLabel,
          target: LABELS[lvl],
          text: fallbackText,
        });
      }
    }

    return t("summary.empty", "No content available for this level.");
  };

  useEffect(() => {
    onSummaryChange(getSummaryForLevel(level));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, i18n.language, bill]);

  return (
    <View style={styles.container}>
      <Text variant="titleLarge" style={styles.title}>
        {t("summary.aiTitle", "AI-Generated Summary")}
      </Text>

      <SegmentedButtons
        value={level}
        onValueChange={(v) => setLevel(v as Level)}
        buttons={[
          { label: LABELS.simple, value: "simple" },
          { label: LABELS.medium, value: "medium" },
          { label: LABELS.complex, value: "complex" },
          { label: LABELS.original, value: "original" },
        ]}
        style={styles.segmented}
      />

      <Text style={[styles.summaryText, { color: theme.colors.onSurface }]}>
        {getSummaryForLevel(level)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 16 },
  title: { marginBottom: 12, paddingHorizontal: 4 },
  segmented: { marginBottom: 12 },
  summaryText: { fontSize: 16, lineHeight: 24, textAlign: "left", paddingHorizontal: 4 },
});
