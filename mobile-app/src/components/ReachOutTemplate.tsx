// mobile-app/src/components/ReachOutTemplate.tsx
// Provides a reusable outreach template with copy-to-clipboard support.

import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import { Button, Card, TextInput, useTheme } from "react-native-paper";
// removed unused View, Text
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import Toast from "react-native-toast-message";

type ReachOutTemplateProps = {
  legislator?: {
    name?: string | null;
    title?: string | null;
  } | null;
  billContext?: {
    billNumber?: string | null;
    billTitle?: string | null;
  } | null;
};

export default function ReachOutTemplate({ legislator, billContext }: ReachOutTemplateProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const templateText = useMemo(() => {
    const subjectLine =
      billContext?.billNumber || billContext?.billTitle
        ? `Subject: Regarding ${billContext.billNumber ?? ""}${
            billContext?.billTitle ? ` — "${billContext.billTitle}"` : ""
          }`
        : "Subject: Regarding [Bill Number/Title]";

    const greeting = (() => {
      const rawName = legislator?.name ?? "";
      const lastName = rawName.trim().split(" ").filter(Boolean).slice(-1)[0] ?? "[Last Name]";
      const title = legislator?.title?.trim() || "[Title]";
      return `Dear ${title} ${lastName},`;
    })();

    const billLine = (() => {
      if (!billContext?.billNumber && !billContext?.billTitle) {
        return "I’m a constituent in [Your City/ZIP]. I’m writing about [Bill Number] – “[Bill Title]”.";
      }
      const number = billContext.billNumber ?? "[Bill Number]";
      const title = billContext.billTitle ?? "[Bill Title]";
      return `I’m a constituent in [Your City/ZIP]. I’m writing about ${number} – “${title}”.`;
    })();

    return [
      subjectLine,
      "",
      greeting,
      "",
      billLine,
      "",
      "I appreciate your service and wanted to share my perspective:",
      "[Briefly state your position in 1–2 sentences.]",
      "",
      "Key points:",
      "- [Point 1]",
      "- [Point 2]",
      "- [Optional personal impact or data point]",
      "",
      `I respectfully ask that you vote [for/against] ${billContext?.billNumber ?? "[Bill Number]"}.`,
      "Thank you for your time and consideration.",
      "",
      "Sincerely,",
      "[Your Full Name]",
      "[Street or Neighborhood, City/ZIP]",
      "[Optional phone/email]",
      "",
    ].join("\n");
  }, [billContext, legislator]);

  const [message, setMessage] = useState(templateText);

  useEffect(() => {
    setMessage(templateText);
  }, [templateText]);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(message);
    Toast.show({
      type: "success",
      text1: t("reachOut.copied", "Template copied"),
    });
  };

  return (
    <Card mode="outlined" style={styles.card}>
      <Card.Title
        title={t("reachOut.title", "Reach Out")}
        subtitle={t(
          "reachOut.subtitle",
          "Customize the draft below, copy it, and send via your preferred channel.",
        )}
      />
      <Card.Content>
        <TextInput
          mode="outlined"
          multiline
          value={message}
          onChangeText={setMessage}
          style={styles.textArea}
        />
      </Card.Content>
      <Card.Actions>
        <Button
          mode="contained"
          icon="content-copy"
          onPress={handleCopy}
          style={styles.copyButton}
          textColor={theme.colors.onPrimary}
        >
          {t("reachOut.copy", "Copy")}
        </Button>
      </Card.Actions>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
  },
  textArea: {
    minHeight: 200,
  },
  copyButton: {
    marginLeft: "auto",
  },
});
