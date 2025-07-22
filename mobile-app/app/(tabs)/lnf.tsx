import { ScrollView, StyleSheet } from "react-native";
import { ThemedText } from "../../components/ThemedText";
import { ThemedView } from "../../components/ThemedView";

export default function LNFScreen() {
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ThemedText type="title">About Love Never Fails</ThemedText>
        <ThemedText style={styles.paragraph}>
          Love Never Fails is dedicated to the restoration, education, and protection of those involved in or at risk of domestic human trafficking. We are committed to fighting for a world where everyone is safe, valued, and loved.
        </ThemedText>

        <ThemedText type="subtitle" style={styles.subtitle}>
          Our Mission
        </ThemedText>
        <ThemedText style={styles.paragraph}>
          To empower individuals and communities to stand against human trafficking through awareness, action, and aftercare.
        </ThemedText>

        <ThemedText type="subtitle" style={styles.subtitle}>
          The Survivor-led Advocate Panel
        </ThemedText>
        <ThemedText style={styles.paragraph}>
          The AI Advocate platform is guided by a panel of survivors of domestic violence, human trafficking, and sexual assault. Their lived experience and expertise are the driving force behind our legislative priorities and advocacy efforts. They review, analyze, and select the bills highlighted in this app to ensure our focus remains on the most critical issues impacting survivors.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  subtitle: {
    marginTop: 24,
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
  },
});
