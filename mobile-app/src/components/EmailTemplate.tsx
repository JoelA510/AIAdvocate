import React from "react";
import { StyleSheet, Linking } from "react-native";
import { Card, Text, Button } from "react-native-paper";
import * as Clipboard from "expo-clipboard";
import Toast from "react-native-toast-message";
import { useTranslation } from "react-i18next";

type Legislator = {
  name?: string;
  email?: string | null;
  offices?: { email?: string | null }[] | null;
};

type Bill = {
  bill_number?: string;
  title?: string;
};

type Props = {
  legislator: Legislator;
  bill: Bill;
};

function pickEmail(leg: Legislator): string | null {
  if (leg?.email) return leg.email;
  const fromOffice = leg?.offices?.find((o) => !!o?.email)?.email ?? null;
  return fromOffice || null;
}

export default function EmailTemplate({ legislator, bill }: Props) {
  const { t } = useTranslation();

  const to = pickEmail(legislator);
  const subject = t("email.subjectLine", "Regarding Bill: {{num}} - {{title}}", {
    num: bill?.bill_number ?? "—",
    title: bill?.title ?? "—",
  });
  const body = t(
    "email.bodyTemplate",
    "Dear {{name}},\n\nI am writing to you as a concerned constituent regarding bill {{num}}.\n\n[Your message here - explain your position]\n\nThank you for your time and service.\n\nSincerely,\n[Your Name]",
    { name: legislator?.name ?? "Representative", num: bill?.bill_number ?? "—" },
  );

  const fullMessage = `${t("email.to", "To")}: ${to ?? "N/A"}\n${t(
    "email.subject",
    "Subject",
  )}: ${subject}\n\n${body}`;

  const openInEmailApp = () => {
    if (!to) {
      Toast.show({
        type: "error",
        text1: t("email.noEmailTitle", "No Email Found"),
        text2: t("email.noEmailMessage", "No email address is available for this legislator."),
      });
      return;
    }
    const mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      body,
    )}`;
    Linking.openURL(mailtoUrl).catch((err) => console.error("Couldn't open email app", err));
  };

  const copyToClipboard = async () => {
    await Clipboard.setStringAsync(fullMessage);
    Toast.show({
      type: "success",
      text1: t("email.copiedTitle", "Copied!"),
      text2: t("email.copiedMessage", "The email template has been copied to your clipboard."),
    });
  };

  return (
    <Card style={styles.card} mode="outlined">
      <Card.Content>
        <Text variant="titleMedium">
          {t("email.to", "To")}: {to ?? "N/A"}
        </Text>
        <Text variant="titleMedium" style={styles.subject}>
          {t("email.subject", "Subject")}: {subject}
        </Text>
        <Text style={styles.body} variant="bodyLarge">
          {body}
        </Text>
      </Card.Content>
      <Card.Actions style={styles.actions}>
        <Button icon="content-copy" onPress={copyToClipboard}>
          {t("email.copy", "Copy")}
        </Button>
        <Button icon="email" mode="contained" onPress={openInEmailApp}>
          {t("email.openInApp", "Open in Email App")}
        </Button>
      </Card.Actions>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 16 },
  subject: { marginTop: 4 },
  body: { marginTop: 16, lineHeight: 22 },
  actions: { justifyContent: "flex-end", padding: 16, paddingTop: 8 },
});
