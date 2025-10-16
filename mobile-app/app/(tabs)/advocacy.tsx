// mobile-app/app/(tabs)/advocacy.tsx (hotfix)
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { ThemedView } from "../../components/ThemedView";
import { ThemedText } from "../../components/ThemedText";
import { Menu, Button, useTheme } from "react-native-paper";
import { supabase } from "../../src/lib/supabase";
import FindYourRep from "../../src/components/FindYourRep";
import type { Bill } from "../../src/components/Bill";

export default function AdvocacyScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const colors = theme.colors as unknown as Record<string, string>;

  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadBills = async () => {
      try {
        const { data, error } = await supabase
          .from("bills")
          .select(
            "id, bill_number, title, slug, status, status_text, status_date, calendar, progress",
          )
          .order("id", { ascending: false })
          .limit(20);
        if (!error && data && isMounted) setBills(data as unknown as Bill[]);
      } catch {}
    };
    loadBills();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{ title: t("tabs.advocacy", { defaultValue: "Advocacy" }), headerShown: false }}
      />
      <ScrollView
        style={styles.scroll}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 8,
            paddingBottom: insets.bottom + 16,
            paddingHorizontal: 16,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        alwaysBounceVertical={false}
      >
        <View
          style={[
            styles.content,
            {
              backgroundColor: colors.surfaceContainerHigh ?? theme.colors.surface,
              borderColor: colors.outlineVariant ?? theme.colors.outline,
            },
          ]}
        >
          <ThemedText type="title" style={styles.title}>
            {t("advocacy.lookupTitle", { defaultValue: "Find Your Representatives" })}
          </ThemedText>

          {bills.length > 0 && (
            <Menu
              visible={menuVisible}
              onDismiss={() => setMenuVisible(false)}
              anchor={
                <Button
                  mode="contained-tonal"
                  onPress={() => setMenuVisible(true)}
                  style={styles.menuButton}
                  textColor={theme.colors.onSecondaryContainer}
                >
                  {selectedBill
                    ? `${selectedBill.bill_number ?? selectedBill.slug ?? selectedBill.id}`
                    : t("advocacy.selectBill", { defaultValue: "Select Bill (optional)" })}
                </Button>
              }
            >
              <Menu.Item
                title={t("advocacy.noneOption", { defaultValue: "None" })}
                onPress={() => setSelectedBill(null)}
              />
              {bills.map((bill) => (
                <Menu.Item
                  key={String(bill.id)}
                  title={`${bill.bill_number ?? bill.slug ?? bill.id} — ${bill.title}`}
                  onPress={() => setSelectedBill(bill)}
                />
              ))}
            </Menu>
          )}

          <FindYourRep bill={selectedBill ?? undefined} />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flexGrow: 1,
    borderRadius: 28,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  title: {
    marginBottom: 4,
  },
  menuButton: {
    marginBottom: 12,
    alignSelf: "flex-start",
    borderRadius: 20,
  },
});
