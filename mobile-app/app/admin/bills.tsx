import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, ScrollView, FlatList, Alert } from "react-native";
import {
  Text,
  TextInput,
  Button,
  Card,
  useTheme,
  ActivityIndicator,
  Switch,
  Divider,
  IconButton,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { useAuth } from "../../src/providers/AuthProvider";
import Toast from "react-native-toast-message";

type AdminBill = {
  id: number;
  bill_number: string;
  title: string;
  panel_review: {
    pros?: string[];
    cons?: string[];
    notes?: string;
    recommendation?: string; // Keep for backward compatibility if needed
    comment?: string; // Keep for backward compatibility if needed
  } | null;
};

type Translation = {
  language_code: string;
  human_verified: boolean;
};

export default function AdminBillsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [bills, setBills] = useState<AdminBill[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedBill, setSelectedBill] = useState<AdminBill | null>(null);
  const [translations, setTranslations] = useState<Translation[]>([]);
  
  // Edit state
  const [pros, setPros] = useState<string[]>([]);
  const [cons, setCons] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Check if user is admin (simple client-side check, RLS enforces real security)
  useEffect(() => {
    const checkAdmin = async () => {
      if (!session?.user) return;
      const { data, error } = await supabase
        .from("app_admins")
        .select("user_id")
        .eq("user_id", session.user.id)
        .single();
      
      if (error || !data) {
        Alert.alert("Access Denied", "You do not have admin permissions.");
        router.replace("/");
      }
    };
    checkAdmin();
  }, [session, router]);

  const searchBills = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("bills")
        .select("id, bill_number, title, panel_review")
        .ilike("bill_number", `%${searchQuery}%`)
        .limit(20);
        
      if (error) throw error;
      setBills(data || []);
    } catch (err: any) {
      Toast.show({ type: "error", text1: "Search failed", text2: err.message });
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  const fetchTranslations = async (billId: number) => {
    const { data, error } = await supabase
      .from("bill_translations")
      .select("language_code, human_verified")
      .eq("bill_id", billId);
      
    if (!error && data) {
      setTranslations(data);
    }
  };

  const handleSelectBill = async (bill: AdminBill) => {
    setSelectedBill(bill);
    setPros(bill.panel_review?.pros || []);
    setCons(bill.panel_review?.cons || []);
    setNotes(bill.panel_review?.notes || bill.panel_review?.comment || "");
    await fetchTranslations(bill.id);
  };

  const handleSave = async () => {
    if (!selectedBill) return;
    setSaving(true);
    try {
      const updatedReview = {
        ...selectedBill.panel_review,
        pros,
        cons,
        notes,
        // Clear legacy fields if we are moving to new structure, or keep them synced?
        // For now, let's just update the new structure.
      };

      const { error } = await supabase
        .from("bills")
        .update({ panel_review: updatedReview })
        .eq("id", selectedBill.id);

      if (error) throw error;

      Toast.show({ type: "success", text1: "Saved successfully" });
      
      // Update local state
      setBills(prev => prev.map(b => b.id === selectedBill.id ? { ...b, panel_review: updatedReview } : b));
      setSelectedBill({ ...selectedBill, panel_review: updatedReview });

    } catch (err: any) {
      Toast.show({ type: "error", text1: "Save failed", text2: err.message });
    } finally {
      setSaving(false);
    }
  };

  const toggleVerified = async (lang: string, currentValue: boolean) => {
    if (!selectedBill) return;
    try {
      const { error } = await supabase
        .from("bill_translations")
        .update({ human_verified: !currentValue })
        .eq("bill_id", selectedBill.id)
        .eq("language_code", lang);

      if (error) throw error;

      setTranslations(prev => prev.map(t => t.language_code === lang ? { ...t, human_verified: !currentValue } : t));
    } catch (err: any) {
      Toast.show({ type: "error", text1: "Update failed", text2: err.message });
    }
  };

  const addPro = () => setPros([...pros, ""]);
  const updatePro = (text: string, index: number) => {
    const newPros = [...pros];
    newPros[index] = text;
    setPros(newPros);
  };
  const removePro = (index: number) => setPros(pros.filter((_, i) => i !== index));

  const addCon = () => setCons([...cons, ""]);
  const updateCon = (text: string, index: number) => {
    const newCons = [...cons];
    newCons[index] = text;
    setCons(newCons);
  };
  const removeCon = (index: number) => setCons(cons.filter((_, i) => i !== index));

  if (!selectedBill) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text variant="headlineMedium">Admin: Bills</Text>
        </View>
        <View style={styles.searchContainer}>
          <TextInput
            mode="outlined"
            placeholder="Search Bill Number (e.g. AB 123)"
            value={searchQuery}
            onChangeText={setSearchQuery}
            right={<TextInput.Icon icon="magnify" onPress={searchBills} />}
            onSubmitEditing={searchBills}
          />
        </View>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={bills}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <Card style={styles.card} onPress={() => handleSelectBill(item)}>
                <Card.Title title={item.bill_number} subtitle={item.title} />
              </Card>
            )}
            contentContainerStyle={{ padding: 16 }}
          />
        )}
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { paddingTop: insets.top }]} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={styles.header}>
        <Button icon="arrow-left" onPress={() => setSelectedBill(null)}>Back</Button>
        <Text variant="headlineSmall" style={{ flex: 1, textAlign: "center" }}>{selectedBill.bill_number}</Text>
        <Button mode="contained" onPress={handleSave} loading={saving}>Save</Button>
      </View>

      <View style={styles.section}>
        <Text variant="titleMedium">Survivor Panel Notes</Text>
        <TextInput
          mode="outlined"
          label="General Notes / Summary"
          multiline
          numberOfLines={4}
          value={notes}
          onChangeText={setNotes}
          style={{ marginBottom: 16 }}
        />

        <Text variant="titleSmall" style={{ marginTop: 8 }}>Pros</Text>
        {pros.map((pro, index) => (
          <View key={index} style={styles.row}>
            <TextInput
              mode="outlined"
              value={pro}
              onChangeText={(text) => updatePro(text, index)}
              style={{ flex: 1 }}
              dense
            />
            <IconButton icon="delete" onPress={() => removePro(index)} />
          </View>
        ))}
        <Button onPress={addPro} icon="plus">Add Pro</Button>

        <Text variant="titleSmall" style={{ marginTop: 16 }}>Cons</Text>
        {cons.map((con, index) => (
          <View key={index} style={styles.row}>
            <TextInput
              mode="outlined"
              value={con}
              onChangeText={(text) => updateCon(text, index)}
              style={{ flex: 1 }}
              dense
            />
            <IconButton icon="delete" onPress={() => removeCon(index)} />
          </View>
        ))}
        <Button onPress={addCon} icon="plus">Add Con</Button>
      </View>

      <Divider style={{ marginVertical: 20 }} />

      <View style={styles.section}>
        <Text variant="titleMedium">Translations</Text>
        {translations.length === 0 ? (
          <Text>No translations found.</Text>
        ) : (
          translations.map((t) => (
            <View key={t.language_code} style={[styles.row, { justifyContent: "space-between", paddingVertical: 8 }]}>
              <Text style={{ textTransform: "uppercase" }}>{t.language_code}</Text>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ marginRight: 8 }}>{t.human_verified ? "Verified" : "Unverified"}</Text>
                <Switch
                  value={t.human_verified}
                  onValueChange={() => toggleVerified(t.language_code, t.human_verified)}
                />
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", padding: 16, justifyContent: "space-between" },
  searchContainer: { padding: 16 },
  card: { marginBottom: 8 },
  section: { padding: 16 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
});
