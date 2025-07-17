// mobile-app/src/components/ExpandableCard.tsx

import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Card, Text, useTheme } from 'react-native-paper';
import * as Haptics from 'expo-haptics';

type ExpandableCardProps = {
  title: string;
  content: string | null | undefined;
  defaultExpanded?: boolean;
};

const ExpandableCard = ({ title, content, defaultExpanded = false }: ExpandableCardProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const theme = useTheme();

  if (!content) {
    return null; // Don't render the card if there's no content
  }

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsExpanded(!isExpanded);
  };

  const blurb = content.substring(0, 150) + (content.length > 150 ? '...' : '');

  return (
    <Card style={styles.card} mode="outlined">
      <Pressable onPress={handlePress}>
        <Card.Title 
          title={title} 
          titleVariant="titleMedium" 
          right={(props) => (
            <Text {...props} style={{ marginRight: 12 }}>
              {isExpanded ? 'Collapse' : 'Expand'}
            </Text>
          )}
        />
        <Card.Content>
          <Text variant="bodyLarge">
            {isExpanded ? content : blurb}
          </Text>
        </Card.Content>
      </Pressable>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
  },
});

export default ExpandableCard;