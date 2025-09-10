import { useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Text, Card, ActivityIndicator, useTheme, List } from "react-native-paper";
import { useTranslation } from "react-i18next";

import { supabase } from "@/lib/supabase";
import { IconSymbol } from "../../components/ui/IconSymbol"; // fixed path

type RelatedBill = {
  id: number;
  bill_number: string;
  title: string;
  similarity?: number;
};

type Props = { billId: number };

export default function RelatedBills({ billId }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const [relatedBills, setRelatedBills] = useState<RelatedBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!billId) return;

    const fetchRelatedBills = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error } = await supabase.rpc("get_related_bills", { p_bill_id: billId });
        if (error) throw new Error(`Failed to fetch related bills: ${error.message}`);
        setRelatedBills((data as RelatedBill[]) || []);
      } catch (err: any) {
        setError(err.message);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchRelatedBills();
  }, [billId]);

  const handlePress = (id: number) => {
    router.push(`/bill/${id}`);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator animating />
        <Text style={styles.statusText}>
          {t("relatedBills.loading", "Finding related bills...")}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={[styles.statusText, { color: theme.colors.error }]}>
          {t("relatedBills.error", "Could not load related bills.")}
        </Text>
      </View>
    );
  }

  if (!relatedBills.length) return null;

  return (
    <View style={styles.container}>
      <Text variant="titleLarge" style={styles.title}>
        {t("relatedBills.title", "Related Bills")}
      </Text>
      <Card style={styles.card}>
        <Card.Content style={styles.cardContent}>
          {relatedBills.map((item, index) => (
            <React.Fragment key={item.id}>
              <List.Item
                title={item.bill_number}
                description={item.title}
                descriptionNumberOfLines={2}
                onPress={() => handlePress(item.id)}
                left={() => (
                  <IconSymbol
                    name="doc.text"
                    size={24}
                    color={theme.colors.primary}
                    style={styles.icon}
                  />
                )}
                right={() => (
                  <IconSymbol
                    name="chevron.right"
                    size={18}
                    color={theme.colors.onSurfaceDisabled}
                  />
                )}
              />
              {index < relatedBills.length - 1 && (
                <View
                  style={[styles.separator, { backgroundColor: theme.colors.outlineVariant }]}
                />
              )}
            </React.Fragment>
          ))}
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 16 },
  title: { marginBottom: 12, paddingHorizontal: 4 },
  card: { borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  cardContent: { paddingHorizontal: 0, paddingVertical: 0 },
  centered: { justifyContent: "center", alignItems: "center", padding: 20 },
  statusText: { marginTop: 8, fontSize: 14 },
  icon: { marginRight: 16, marginLeft: 8, alignSelf: "center" },
  separator: { height: 1, marginHorizontal: 16 },
});
