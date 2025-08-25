// mobile-app/src/components/SummarySlider.tsx

import React, { useState, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { Slider } from 'react-native-awesome-slider';
import { useSharedValue } from 'react-native-reanimated';
import { Bill } from './Bill';

type SummarySliderProps = {
  bill: Bill;
  onSummaryChange: (text: string) => void;
};

const SUMMARY_LEVELS = ['Simple', 'Medium', 'Complex', 'Original Text'];

export default function SummarySlider({ bill, onSummaryChange }: SummarySliderProps) {
  const theme = useTheme();
  const [summaryLevel, setSummaryLevel] = useState(0);
  
  const progress = useSharedValue(0);
  const min = useSharedValue(0);
  const max = useSharedValue(SUMMARY_LEVELS.length - 1);

  const summaries = [
    bill.summary_simple,
    bill.summary_medium,
    bill.summary_complex,
    bill.original_text,
  ];
  
  const activeSummaryText = summaries[summaryLevel] || 'No content available for this level.';

  useEffect(() => {
    onSummaryChange(activeSummaryText);
  }, [activeSummaryText, onSummaryChange]);

  const handleSliderChange = (value: number) => {
    const newLevel = Math.round(value);
    setSummaryLevel(newLevel);
  };

  return (
    <View style={styles.container}>
      <Text variant="titleLarge" style={styles.title}>
        AI-Generated Summary
      </Text>
      <View style={styles.sliderContainer}>
        <Slider
          style={styles.slider}
          progress={progress}
          minimumValue={min}
          maximumValue={max}
          onValueChange={handleSliderChange}
          step={SUMMARY_LEVELS.length}
          thumbWidth={20}
          theme={{
            disableMinTrackTintColor: theme.colors.primary,
            maximumTrackTintColor: theme.colors.surfaceVariant,
            minimumTrackTintColor: theme.colors.primary,
          }}
        />
        <View style={styles.labels}>
          {SUMMARY_LEVELS.map((level, index) => (
            <Text
              key={level}
              style={[
                styles.label,
                { color: summaryLevel === index ? theme.colors.primary : theme.colors.onSurfaceDisabled },
              ]}
            >
              {level}
            </Text>
          ))}
        </View>
      </View>
      <Text style={styles.summaryText}>{activeSummaryText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 16, },
  title: { marginBottom: 16, paddingHorizontal: 4, },
  sliderContainer: { paddingHorizontal: 10, marginBottom: 16, },
  slider: { height: 40, },
  labels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 5, },
  label: { fontSize: 12, },
  summaryText: { fontSize: 16, lineHeight: 24, textAlign: 'left', paddingHorizontal: 4, },
});