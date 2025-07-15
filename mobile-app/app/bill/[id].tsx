import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { StyleSheet, View, Pressable, ScrollView } from "react-native";
import { Card, Divider, Text, useTheme } from "react-native-paper";

import { ThemedText } from "../../components/ThemedText";
import { ThemedView } from "../../components/ThemedView";
import { IconSymbol } from "../../components/ui/IconSymbol";
import EmptyState from "../../src/components/EmptyState";
import { supabase } from "../../src/lib/supabase";

import type { Bill } from "../../src/components/Bill";

export default function BillDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const theme = useTheme(); // Get the theme
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The back button color is now derived from the theme.
  const backButtonColor = theme.colors.onSurface;

  useEffect(() => {
    if (!id) return;
    const fetchBill = async () => {
      try {
        const { data, error } = await supabase
          .from("bills")
          .select("*")
          .eq("id", id)
          .single();
        if (error) throw error;
        setBill(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchBill();
  }, [id]);

  if (loading) {
    return (
      <ThemedView style={styles.container}>
        <Text>Loading...</Text>
      </ThemedView>
    );
  }

  if (error || !bill) {
    // Note: No ThemedView needed here as EmptyState provides it.
    return (
      <View style={{ flex: 1, paddingTop: 60, backgroundColor: theme.colors.background }}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol
            name="chevron.right"
            color={backButtonColor}
            size={24}
            style={styles.backIcon}
          />
          <ThemedText>Back</ThemedText>
        </Pressable>
        <EmptyState
          icon="chevron.left.forwardslash.chevron.right"
          title={error ? "An Error Occurred" : "Bill Not Found"}
          message={
            error
              ? `Could not load the bill. \n(${error})`
              : `The bill with ID #${id} could not be found.`
          }
        />
      </View>
    );
  }

  return (
    // Set the ScrollView background color from the theme
    <ScrollView style={[styles.scrollView, { backgroundColor: theme.colors.background }]}>
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <IconSymbol
            name="chevron.right"
            color={backButtonColor}
            size={24}
            style={styles.backIcon}
          />
          <ThemedText style={{ fontSize: 16 }}>Back</ThemedText>
        </Pressable>

        <Text variant="headlineMedium" style={styles.title}>
          {bill.bill_number}
        </Text>
        <Text variant="titleLarge" style={styles.subtitle}>
          {bill.title}
        </Text>

        <Divider style={styles.divider} />

        {/* The Bill component from Paper should theme automatically */}

        <Card style={styles.summaryCard} mode="outlined">
          <Card.Title title="Simple Summary" titleVariant="titleMedium" />
          <Card.Content>
            <Text variant="bodyLarge">{bill.summary_simple}</Text>
          </Card.Content>
        </Card>

        <Card style={styles.summaryCard} mode="outlined">
          <Card.Title title="Medium Summary" titleVariant="titleMedium" />
          <Card.Content>
            <Text variant="bodyLarge">{bill.summary_medium}</Text>
          </Card.Content>
        </Card>

        <Card style={styles.summaryCard} mode="outlined">
          <Card.Title title="Complex Summary" titleVariant="titleMedium" />
          <Card.Content>
            <Text variant="bodyLarge">{bill.summary_complex}</Text>
          </Card.Content>
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 60,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    alignSelf: "flex-start",
  },
  backIcon: {
    transform: [{ rotate: "180deg" }],
  },
  title: {
    fontWeight: "bold",
  },
  subtitle: {
    marginBottom: 16,
  },
  divider: {
    marginVertical: 16,
  },
  summaryCard: {
    marginTop: 16,
  },
});