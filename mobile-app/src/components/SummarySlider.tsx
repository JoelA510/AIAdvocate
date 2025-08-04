// mobile-app/src/components/SummarySlider.tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SegmentedButtons, Text } from 'react-native-paper';
import { Bill } from './Bill';

type SummarySliderProps = {
  bill: Bill;
};

export default function SummarySlider({ bill }: SummarySliderProps) {
  const [value, setValue] = React.useState('Simple');

  const summaries = {
    Simple: bill.summary_simple,
    Medium: bill.summary_medium,
    Complex: bill.summary_complex,
    'Original Text': bill.original_text,
  };

  const selectedContent = summaries[value] || 'Summary not available.';

  return (
    <View style={styles.container}>
      <SegmentedButtons
        value={value}
        onValueChange={setValue}
        buttons={[
          { value: 'Simple', label: 'Simple' },
          { value: 'Medium', label: 'Medium' },
          { value: 'Complex', label: 'Complex' },
          { value: 'Original Text', label: 'Original' },
        ]}
        style={styles.buttons}
      />
      <View style={styles.content}>
        <Text variant="bodyLarge">{selectedContent}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 24,
  },
  buttons: {
    marginBottom: 16,
  },
  content: {
    paddingHorizontal: 8,
  },
});