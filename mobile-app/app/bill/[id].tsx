import { useLocalSearchParams, useRouter } from "expo-router";
import { useState, useEffect } from "react";
import { StyleSheet, View, Pressable } from "react-native";

import BillComponent from "@/components/Bill";
import EmptyState from "@/components/EmptyState";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { IconSymbol } from "@/components/ui/IconSymbol";
import { useThemeColor } from "@/hooks/useThemeColor";
import { supabase } from "@/lib/supabase";

export default function BillDetailsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const placeholderColor = useThemeColor(
    { light: "#e0e0e0", dark: "#3a3a3a" },
    "background",
  );
  const backButtonColor = useThemeColor({ light: "#000", dark: "#fff" }, "text");

  useEffect(() => {
    if (!id) return;

    const fetchBill = async () => {
      try {
        const { data, error } = await supabase
          .from("bills")
          .select("*")
          .eq("id", id)
          .single();

        if (error) {
          throw error;
        }
        setBill(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchBill();
  }, [id]);

  const renderLoadingState = () => (
    <ThemedView style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <IconSymbol name="chevron.right" color={backButtonColor} size={24} style={styles.backIcon} />
        <ThemedText type="link">Back</ThemedText>
      </Pressable>
      <View style={[styles.placeholder, { height: 32, width: '60%', backgroundColor: placeholderColor }]} />
      <View style={[styles.placeholder, { height: 24, width: '80%', marginTop: 12, backgroundColor: placeholderColor }]} />
      
      <View style={styles.summaryContainer}>
        <View style={[styles.placeholder, { height: 22, width: '40%', backgroundColor: placeholderColor }]} />
        <View style={[styles.placeholder, { height: 20, width: '100%', marginTop: 10, backgroundColor: placeholderColor }]} />
        <View style={[styles.placeholder, { height: 20, width: '95%', marginTop: 8, backgroundColor: placeholderColor }]} />
      </View>
      <View style={styles.summaryContainer}>
        <View style={[styles.placeholder, { height: 22, width: '40%', backgroundColor: placeholderColor }]} />
        <View style={[styles.placeholder, { height: 20, width: '100%', marginTop: 10, backgroundColor: placeholderColor }]} />
        <View style={[styles.placeholder, { height: 20, width: '95%', marginTop: 8, backgroundColor: placeholderColor }]} />
      </View>
    </ThemedView>
  );

  if (loading) {
    return renderLoadingState();
  }

  if (error || !bill) {
    return (
      <ThemedView style={{flex: 1, paddingTop: 60}}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
            <IconSymbol name="chevron.right" color={backButtonColor} size={24} style={styles.backIcon} />
            <ThemedText type="link">Back</ThemedText>
        </Pressable>
        <EmptyState
          icon="chevron.left.forwardslash.chevron.right"
          title={error ? "An Error Occurred" : "Bill Not Found"}
          message={error ? `Could not load the bill. \n(${error})` : `The bill with ID #${id} could not be found.`}
        />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <IconSymbol name="chevron.right" color={backButtonColor} size={24} style={styles.backIcon} />
        <ThemedText type="link">Back</ThemedText>
      </Pressable>
      <ThemedText type="title">{bill.bill_number}</ThemedText>
      <ThemedText type="subtitle">{bill.title}</ThemedText>

      {/* Pass the bill object to a single BillComponent to handle interactions */}
      <BillComponent bill={bill} />

      <View style={styles.summaryContainer}>
        <ThemedText type="defaultSemiBold">Simple Summary:</ThemedText>
        <ThemedText>{bill.summary_simple}</ThemedText>
      </View>
      <View style={styles.summaryContainer}>
        <ThemedText type="defaultSemiBold">Medium Summary:</ThemedText>
        <ThemedText>{bill.summary_medium}</ThemedText>
      </View>
      <View style={styles.summaryContainer}>
        <ThemedText type="defaultSemiBold">Complex Summary:</ThemedText>
        <ThemedText>{bill.summary_complex}</ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    paddingTop: 60,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  backIcon: {
    transform: [{ rotate: '180deg' }],
  },
  summaryContainer: {
    marginTop: 24,
    gap: 8,
  },
  placeholder: {
    borderRadius: 4,
  },
});