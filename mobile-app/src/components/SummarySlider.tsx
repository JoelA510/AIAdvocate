// mobile-app/src/components/SummarySlider.tsx
import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text, useTheme } from "react-native-paper";
import { Slider } from "react-native-awesome-slider";
import { useSharedValue } from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import { Bill } from "./Bill";

type Props = {
  bill: Bill;
  onSummaryChange: (text: string) => void;
};

export default function SummarySlider({ bill, onSummaryChange }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();

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

  // Slider shared values
  const min = useSharedValue(0);
  const max = useSharedValue(LEVELS.length - 1);
  const progress = useSharedValue(level);

  const summaries = [
    bill.summary_simple,
    bill.summary_medium,
    bill.summary_complex,
    bill.original_text,
  ];

  const activeText = summaries[level] ?? t("summary.empty", "No content available for this level.");

  // Keep the knob in sync when level changes
  useEffect(() => {
    progress.value = level;
  }, [level, progress]);

  // Emit text whenever it changes
  useEffect(() => {
    onSummaryChange(activeText);
  }, [activeText, onSummaryChange]);

  const snap = (v: number) => {
    const snapped = Math.round(v);
    if (snapped !== level) setLevel(snapped);
  };

  return (
    <View style={styles.container}>
      <Text variant="titleLarge" style={styles.title}>
        {t("summary.aiTitle", "AI-Generated Summary")}
      </Text>

      <View style={styles.sliderContainer}>
        <Slider
          style={styles.slider}
          progress={progress}
          minimumValue={min}
          maximumValue={max}
          steps={LEVELS.length - 1} // 0..3
          onValueChange={snap}
          onSlidingComplete={snap}
          thumbWidth={20}
          theme={{
            maximumTrackTintColor: theme.colors.surfaceVariant,
            minimumTrackTintColor: theme.colors.primary,
            disableMinTrackTintColor: theme.colors.primary,
          }}
        />
        <View style={styles.labels}>
          {LEVELS.map((label, idx) => (
            <Text
              key={label}
              style={[
                styles.label,
                { color: idx === level ? theme.colors.primary : theme.colors.onSurfaceDisabled },
              ]}
              accessibilityRole="button"
              onPress={() => setLevel(idx)}
            >
              {label}
            </Text>
          ))}
        </View>
      </View>

      <Text style={styles.summaryText}>{activeText}</Text>
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
