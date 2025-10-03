// mobile-app/app/(tabs)/advocacy.tsx (hotfix)
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { ThemedView } from "../../components/ThemedView";
import { ThemedText } from "../../components/ThemedText";
import { Menu, Button } from "react-native-paper";
import { supabase } from "../../src/lib/supabase";
import FindYourRep from "../../src/components/FindYourRep";
import type { Bill } from "../../src/components/Bill";

export default function AdvocacyScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

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
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen
        options={{ title: t("tabs.advocacy", { defaultValue: "Advocacy" }), headerShown: false }}
      />
      <View
        style={{
          flex: 1,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingHorizontal: 16,
        }}
      >
        <ThemedText type="title" style={{ marginBottom: 12 }}>
          {t("advocacy.lookupTitle", { defaultValue: "Find Your Representatives" })}
        </ThemedText>

        {bills.length > 0 && (
          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setMenuVisible(true)}
                style={{ marginBottom: 12, alignSelf: "flex-start" }}
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
    </ThemedView>
  );
}
