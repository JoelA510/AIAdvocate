// mobile-app/app/(tabs)/advocacy.tsx (modified)
// Modernized Advocacy tab reusing FindYourRep.  Provides optional bill
// selection and then shows the unified representative lookup.

import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { ThemedView } from "../../components/ThemedView";
import { ThemedText } from "../../components/ThemedText";
import { Menu, Button } from "react-native-paper";
import { supabase } from "@/lib/supabase";
import FindYourRep from "@/components/FindYourRep";
import type { Bill } from "@/components/Bill";

export default function AdvocacyScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [bills, setBills] = useState<Bill[]>([]);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  // Fetch a small list of recent bills to offer as email context.
  useEffect(() => {
    let isMounted = true;
    const loadBills = async () => {
      try {
        const { data, error } = await supabase
          .from("bills")
          .select("id, bill_number, title, slug")
          .order("id", { ascending: false })
          .limit(20);
        if (!error && data && isMounted) {
          setBills(data as unknown as Bill[]);
        }
      } catch {
        // swallow errors; selection menu will simply not appear
      }
    };
    loadBills();
    return () => {
      isMounted = false;
    };
  }, []);

  const openMenu = () => setMenuVisible(true);
  const closeMenu = () => setMenuVisible(false);
  const chooseBill = (bill: Bill | null) => {
    setSelectedBill(bill);
    closeMenu();
  };

  return (
    <ThemedView style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: t("tabs.advocacy", { defaultValue: "Advocacy" }),
          headerShown: false,
        }}
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
        {/* Bill selection dropdown; only rendered if we have bills */}
        {bills.length > 0 && (
          <Menu
            visible={menuVisible}
            onDismiss={closeMenu}
            anchor={
              <Button
                mode="outlined"
                onPress={openMenu}
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
              onPress={() => chooseBill(null)}
            />
            {bills.map((bill) => (
              <Menu.Item
                key={String(bill.id)}
                title={`${bill.bill_number ?? bill.slug ?? bill.id} — ${bill.title}`}
                onPress={() => chooseBill(bill)}
              />
            ))}
          </Menu>
        )}
        {/* Unified representative lookup component.  Pass selected bill if any. */}
        <FindYourRep bill={selectedBill ?? undefined} />
      </View>
    </ThemedView>
  );
}
