// mobile-app/src/components/EmailTemplate.tsx

import React from 'react';
import { View, StyleSheet, Linking } from 'react-native';
import { Card, Text, Button } from 'react-native-paper';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';

type Legislator = any;
type Bill = any;

type EmailTemplateProps = {
  legislator: Legislator;
  bill: Bill;
};

export default function EmailTemplate({ legislator, bill }: EmailTemplateProps) {
  // --- THE FINAL FIX: Read from the top-level 'email' property ---
  const to = legislator.email || 'N/A';
  
  const subject = `Regarding Bill: ${bill.bill_number} - ${bill.title}`;
  const body = `Dear ${legislator.name},\n\nI am writing to you today as a concerned constituent to express my views on bill ${bill.bill_number}.\n\n[Your message here - explain your position on the bill]\n\nI believe this legislation is important, and I urge you to consider my perspective when you vote.\n\nThank you for your time and service.\n\nSincerely,\n[Your Name]`;
  const fullMessage = `To: ${to}\nSubject: ${subject}\n\n${body}`;

  const openInEmailApp = () => {
    if (to === 'N/A') {
      Toast.show({ type: 'error', text1: 'No Email Found', text2: 'No email address is available for this legislator.' });
      return;
    }
    const mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    Linking.openURL(mailtoUrl).catch(err => console.error("Couldn't load page", err));
  };

  const copyToClipboard = async () => {
    await Clipboard.setStringAsync(fullMessage);
    Toast.show({ type: 'success', text1: 'Copied!', text2: 'The email template has been copied to your clipboard.' });
  };

  return (
    <Card style={styles.card} mode="outlined">
      <Card.Content>
        <Text variant="titleMedium">To: {to}</Text>
        <Text variant="titleMedium" style={styles.subject}>Subject: {subject}</Text>
        <Text style={styles.body} variant="bodyLarge">{body}</Text>
      </Card.Content>
      <Card.Actions style={styles.actions}>
        <Button icon="content-copy" onPress={copyToClipboard}>Copy</Button>
        <Button icon="email" mode="contained" onPress={openInEmailApp}>Open in Email App</Button>
      </Card.Actions>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 16 },
  subject: {
    marginTop: 4,
  },
  body: { 
    marginTop: 16, 
    lineHeight: 22 
  },
  actions: { 
    justifyContent: 'flex-end', 
    padding: 16,
    paddingTop: 8,
  },
});