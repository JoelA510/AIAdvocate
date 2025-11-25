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
  Searchbar,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { useAuth } from "../../src/providers/AuthProvider";
import Toast from "react-native-toast-message";
import { ThemedView } from "../../components/ThemedView";

// Helper function for audit logging
const logAdminAction = async (userId: string, action: string, billId?: number, details?: any) => {
  try {
    await supabase.from('admin_audit_log').insert({
      user_id: userId,
      action,
      bill_id: billId,
      details: details ? JSON.stringify(details) : null,
    });
  } catch (err) {
    // Silent fail on audit logging to not interrupt user workflow
    console.warn('Failed to log admin action:', err);
  }
};

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
  title?: string;
  summary_simple?: string;
};

export default function AdminBillsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session } = useAuth();
  const colors = theme.colors as unknown as Record<string, string>;

  const [searchQuery, setSearchQuery] = useState("");
  const [bills, setBills] = useState<AdminBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoad, setInitialLoad] = useState(true);
  const [selectedBill, setSelectedBill] = useState<AdminBill | null>(null);
  const [translations, setTranslations] = useState<Translation[]>([]);

  // Edit state
  const [pros, setPros] = useState<string[]>([]);
  const [cons, setCons] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  // Logs state
  const [billLogs, setBillLogs] = useState<any[]>([]);

  // Translation edit state
  const [editingTranslation, setEditingTranslation] = useState<string | null>(null);
  const [transTitle, setTransTitle] = useState("");
  const [transSummary, setTransSummary] = useState("");

  // Check if user is admin (simple client-side check, RLS enforces real security)
  useEffect(() => {
    const checkAdmin = async () => {
      if (!session?.user || !session.user.email) {
        router.replace("/admin/login");
        return;
      }

      const { data, error } = await supabase
        .from("app_admins")
        .select("user_id")
        .eq("user_id", session.user.id)
        .single();

      if (error || !data) {
        Alert.alert("Access Denied", "You do not have admin permissions.");
        router.replace("/admin/login");
      }
    };
    checkAdmin();
  }, [session, router]);

  // Load all bills on mount
  useEffect(() => {
    loadBills();
  }, []);

  const loadBills = async (query?: string) => {
    setLoading(true);
    try {
      let queryBuilder = supabase
        .from("bills")
        .select("id, bill_number, title, panel_review, created_at")
        .order("created_at", { ascending: false })
        .limit(50);

      if (query?.trim()) {
        queryBuilder = queryBuilder.ilike("bill_number", `%${query}%`);
      }

      const { data, error } = await queryBuilder;

      if (error) throw error;
      setBills(data || []);
    } catch (err: any) {
      Toast.show({ type: "error", text1: "Failed to load bills", text2: err.message });
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  };

  const searchBills = useCallback(async () => {
    await loadBills(searchQuery);
  }, [searchQuery]);

  const fetchTranslations = async (billId: number) => {
    const { data, error } = await supabase
      .from("bill_translations")
      .select("language_code, human_verified, title, summary_simple")
      .eq("bill_id", billId);

    if (!error && data) {
      setTranslations(data);
    }
  };

  const loadBillLogs = async (billId: number) => {
    const { data, error } = await supabase
      .from("admin_audit_log")
      .select("*")
      .eq("bill_id", billId)
      .order("timestamp", { ascending: false });

    if (!error && data) {
      setBillLogs(data);
    }
  };

  const handleSelectBill = async (bill: AdminBill) => {
    setSelectedBill(bill);
    setPros(bill.panel_review?.pros || []);
    setCons(bill.panel_review?.cons || []);
    setNotes(bill.panel_review?.notes || bill.panel_review?.comment || "");
    await fetchTranslations(bill.id);
    await loadBillLogs(bill.id);
  };

  const startEditingTranslation = (t: any) => {
    setEditingTranslation(t.language_code);
    setTransTitle(t.title || "");
    setTransSummary(t.summary_simple || "");
  };

  const saveTranslation = async (lang: string) => {
    if (!selectedBill) return;
    try {
      const { error } = await supabase
        .from("bill_translations")
        .update({
          title: transTitle,
          summary_simple: transSummary,
          human_verified: true // Auto-verify on edit
        })
        .eq("bill_id", selectedBill.id)
        .eq("language_code", lang);

      if (error) throw error;

      Toast.show({ type: "success", text1: "Translation updated" });
      setEditingTranslation(null);
      fetchTranslations(selectedBill.id); // Reload

      await logAdminAction(
        session!.user!.id,
        'update_translation',
        selectedBill.id,
        { language: lang }
      );
    } catch (err: any) {
      Toast.show({ type: "error", text1: "Update failed", text2: err.message });
    }
  };

  const handleSave = async () => {
    if (!selectedBill || !session?.user) return;
    setSaving(true);
    try {
      const updatedReview = {
        ...selectedBill.panel_review,
        pros,
        cons,
        notes,
      };

      // Use RPC to ensure persistence (bypasses potential RLS issues)
      const { error } = await supabase.rpc('update_bill_review', {
        p_bill_id: selectedBill.id,
        p_review: updatedReview
      });

      if (error) throw error;

      // Verify save by reading back
      const { data: verifyData, error: verifyError } = await supabase
        .from("bills")
        .select("panel_review")
        .eq("id", selectedBill.id)
        .single();

      if (verifyError || !verifyData) {
        console.error("Verification failed:", verifyError);
        throw new Error("Save verified failed - data may not have persisted");
      }

      // Deep verification: Check if content matches
      const savedReview = verifyData.panel_review;
      if (
        savedReview.notes !== notes ||
        JSON.stringify(savedReview.pros) !== JSON.stringify(pros) ||
        JSON.stringify(savedReview.cons) !== JSON.stringify(cons)
      ) {
        throw new Error("Save verification mismatch - DB data does not match local state");
      }

      Toast.show({ type: "success", text1: "Saved successfully" });

      // Update local state
      setBills(prev => prev.map(b => b.id === selectedBill.id ? { ...b, panel_review: updatedReview } : b));
      setSelectedBill({ ...selectedBill, panel_review: updatedReview });

    } catch (err: any) {
      console.error("Save error:", err);
      Toast.show({ type: "error", text1: "Save failed", text2: err.message });
    } finally {
      setSaving(false);
    }
  };

  const toggleVerified = async (lang: string, currentValue: boolean) => {
    if (!selectedBill || !session?.user) return;
    try {
      const { error } = await supabase
        .from("bill_translations")
        .update({ human_verified: !currentValue })
        .eq("bill_id", selectedBill.id)
        .eq("language_code", lang);

      if (error) throw error;

      setTranslations(prev => prev.map(t => t.language_code === lang ? { ...t, human_verified: !currentValue } : t));

      // Log the verification toggle
      await logAdminAction(
        session.user.id,
        'toggle_translation_verification',
        selectedBill.id,
        { language: lang, verified: !currentValue }
      );
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
      <ThemedView style={[styles.container, { paddingTop: insets.top + 8 }]}>
        <View
          style={[
            styles.header,
            {
              backgroundColor: colors.surfaceContainerHigh ?? theme.colors.surface,
              borderColor: colors.outlineVariant ?? theme.colors.outline,
              shadowColor: colors.shadow ?? "#000",
            },
          ]}
        >
          <View style={styles.headerTopRow}>
            <Text variant="titleLarge" style={{ fontWeight: '600' }}>Admin View: Bills</Text>
            <View style={{ flexDirection: 'row' }}>
              <IconButton
                icon="account-group"
                onPress={() => router.push('/admin/users')}
                mode="contained-tonal"
                size={24}
                style={{ marginRight: 8 }}
              />
              <IconButton
                icon="account-cog"
                onPress={() => router.push('/admin/account')}
                mode="contained-tonal"
                size={24}
              />
            </View>
          </View>
          <Searchbar
            placeholder="Search Bill Number (e.g. AB 123)"
            onChangeText={setSearchQuery}
            value={searchQuery}
            onSubmitEditing={searchBills}
            onIconPress={searchBills}
            loading={loading}
            style={[
              styles.searchbar,
              {
                backgroundColor: colors.surfaceContainerLowest ?? theme.colors.surface,
                borderColor: colors.outlineVariant ?? theme.colors.outline,
              },
            ]}
            inputStyle={{ fontSize: 16 }}
            iconColor={theme.colors.primary}
            placeholderTextColor={theme.colors.onSurfaceVariant}
          />
          <Button mode="text" onPress={() => router.push('/admin/logs')} style={{ alignSelf: 'flex-end', marginTop: -8 }}>
            View All Logs
          </Button>
        </View>

        <View style={[styles.content, { paddingBottom: insets.bottom + 12 }]}>
          {loading && initialLoad ? (
            <ActivityIndicator style={{ marginTop: 20 }} size="large" />
          ) : (
            <FlatList
              key="bills-list"
              data={bills}
              keyExtractor={(item) => item.id.toString()}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
              renderItem={({ item }) => (
                <Card style={styles.card} onPress={() => handleSelectBill(item)}>
                  <Card.Title title={item.bill_number} subtitle={item.title} />
                </Card>
              )}
            />
          )}
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.surfaceContainerHigh ?? theme.colors.surface,
            borderColor: colors.outlineVariant ?? theme.colors.outline,
            shadowColor: colors.shadow ?? "#000",
            marginBottom: 0, // Override default margin for detail view
          },
        ]}
      >
        <View style={styles.headerTopRow}>
          <Button icon="arrow-left" onPress={() => setSelectedBill(null)}>Back</Button>
          <Text variant="titleMedium" style={{ fontWeight: '600' }}>{selectedBill.bill_number}</Text>
          <Button mode="contained" onPress={handleSave} loading={saving}>Save</Button>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text variant="titleMedium">Survivor Panel Notes</Text>
          <TextInput
            mode="outlined"
            label="General Notes / Summary"
            multiline
            numberOfLines={4}
            value={notes}
            onChangeText={setNotes}
            style={{ marginBottom: 16, backgroundColor: theme.colors.surface }}
          />

          <Text variant="titleSmall" style={{ marginTop: 8 }}>Pros</Text>
          {pros.map((pro, index) => (
            <View key={index} style={styles.row}>
              <TextInput
                mode="outlined"
                value={pro}
                onChangeText={(text) => updatePro(text, index)}
                style={{ flex: 1, backgroundColor: theme.colors.surface }}
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
                style={{ flex: 1, backgroundColor: theme.colors.surface }}
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
            translations.map((t: any) => (
              <Card key={t.language_code} style={{ marginBottom: 12, backgroundColor: theme.colors.surface }}>
                <Card.Content>
                  <View style={[styles.row, { justifyContent: "space-between" }]}>
                    <Text style={{ textTransform: "uppercase", fontWeight: 'bold' }}>{t.language_code}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={{ marginRight: 8 }}>{t.human_verified ? "Verified" : "Unverified"}</Text>
                      <Switch
                        value={t.human_verified}
                        onValueChange={() => toggleVerified(t.language_code, t.human_verified)}
                      />
                    </View>
                  </View>

                  {editingTranslation === t.language_code ? (
                    <View>
                      <TextInput
                        label="Title"
                        value={transTitle}
                        onChangeText={setTransTitle}
                        style={{ marginBottom: 8 }}
                      />
                      <TextInput
                        label="Summary"
                        value={transSummary}
                        onChangeText={setTransSummary}
                        multiline
                        numberOfLines={3}
                        style={{ marginBottom: 8 }}
                      />
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                        <Button onPress={() => setEditingTranslation(null)}>Cancel</Button>
                        <Button mode="contained" onPress={() => saveTranslation(t.language_code)}>Save</Button>
                      </View>
                    </View>
                  ) : (
                    <View>
                      <Text variant="bodyMedium" style={{ fontWeight: 'bold' }}>{t.title}</Text>
                      <Text variant="bodySmall" numberOfLines={2}>{t.summary_simple}</Text>
                      <Button onPress={() => startEditingTranslation(t)} style={{ alignSelf: 'flex-start', marginTop: 4 }}>Edit</Button>
                    </View>
                  )}
                </Card.Content>
              </Card>
            ))
          )}
        </View>

        <Divider style={{ marginVertical: 20 }} />

        <View style={styles.section}>
          <Text variant="titleMedium" style={{ marginBottom: 8 }}>Audit Logs (This Bill)</Text>
          {billLogs.length === 0 ? (
            <Text>No logs found for this bill.</Text>
          ) : (
            billLogs.map((log) => (
              <View key={log.id} style={{ marginBottom: 8, padding: 8, backgroundColor: theme.colors.surfaceVariant, borderRadius: 8 }}>
                <Text variant="labelSmall">{new Date(log.timestamp).toLocaleString()}</Text>
                <Text variant="bodyMedium">{log.action}</Text>
                <Text variant="bodySmall" style={{ fontFamily: 'monospace' }}>{JSON.stringify(log.details)}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    elevation: 1,
  },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  searchbar: {
    borderRadius: 22,
    borderWidth: 1,
    elevation: 0,
  },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  card: { marginBottom: 8 },
  detailHeader: { flexDirection: "row", alignItems: "center", padding: 16, justifyContent: "space-between" },
  section: { padding: 16 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
});
