// mobile-app/src/components/SummarySlider.tsx (modified)

import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import Slider from "@react-native-community/slider";
import { useTranslation } from "react-i18next";
import { Bill } from "./Bill";

type Props = {
  bill: Bill;
  onSummaryChange: (text: string) => void;
};

/**
 * A summary picker that lets the user switch between simple, medium, complex
 * summaries or the original text.  Uses a discrete slider with four
 * positions (0–3) and emits the appropriate text via `onSummaryChange`.
 * It also displays the currently selected summary below the slider.
 */
export default function SummarySlider({ bill, onSummaryChange }: Props) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();

  const LEVELS = useMemo(
    () => [
      t("summary.level.simple", "Simple"),
      t("summary.level.medium", "Medium"),
      t("summary.level.complex", "Complex"),
      t("summary.level.original", "Original Text"),
    ],
    [t],
  );

  const [level, setLevel] = useState(0);

  // Compute the summary text for the given level and language.  Spanish
  // summaries are used when available; otherwise fall back to English.
  const getSummaryForLevel = (lvl: number) => {
    const lang = i18n.language ?? "en";
    const texts: (string | null | undefined)[] = [
      lang.startsWith("es") && bill.summary_simple_es ? bill.summary_simple_es : bill.summary_simple,
      lang.startsWith("es") && bill.summary_medium_es ? bill.summary_medium_es : bill.summary_medium,
      lang.startsWith("es") && bill.summary_complex_es ? bill.summary_complex_es : bill.summary_complex,
      bill.original_text,
    ];
    const text = texts[lvl] ?? null;
    return text || t("summary.empty", "No content available for this level.");
  };

  // Emit the summary to the parent whenever the level or language changes.
  useEffect(() => {
    onSummaryChange(getSummaryForLevel(level));
  }, [level, i18n.language, bill, onSummaryChange]);

  return (
    <View style={styles.container}>
      <Text variant="titleLarge" style={styles.title}>
        {t("summary.aiTitle", "AI-Generated Summary")}
      </Text>
      <View style={styles.sliderContainer}>
        <Slider
          minimumValue={0}
          maximumValue={LEVELS.length - 1}
          step={1}
          value={level}
          onValueChange={(value) => setLevel(value)}
          minimumTrackTintColor={theme.colors.primary}
          maximumTrackTintColor={theme.colors.surfaceVariant}
          thumbTintColor={theme.colors.primary}
          style={styles.slider}
        />
        <View style={styles.labels}>
          {LEVELS.map((label, idx) => (
            <Text
              key={label}
              style={[
                styles.label,
                {
                  color: idx === level ? theme.colors.primary : theme.colors.onSurfaceDisabled,
                },
              ]}
              accessibilityRole="button"
              onPress={() => setLevel(idx)}
            >
              {label}
            </Text>
          ))}
        </View>
      </View>
      <Text style={styles.summaryText}>{getSummaryForLevel(level)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 16 },
  title: { marginBottom: 16, paddingHorizontal: 4 },
  sliderContainer: { paddingHorizontal: 10, marginBottom: 16 },
  slider: { height: 40 },
  labels: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 5 },
  label: { fontSize: 12 },
  summaryText: { fontSize: 16, lineHeight: 24, textAlign: "left", paddingHorizontal: 4 },
});
