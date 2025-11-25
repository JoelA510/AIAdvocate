import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, ScrollView, FlatList, Alert, Platform } from "react-native";
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
  SegmentedButtons,
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
    console.warn('Failed to log admin action:', err);
  }
};

type AdminBill = {
  id: number;
  bill_number: string;
  title: string;
  summary_simple?: string;
  summary_medium?: string;
  summary_complex?: string;
  original_text?: string;
  panel_review: {
    pros?: string[];
    cons?: string[];
    notes?: string;
    recommendation?: string;
    comment?: string;
  } | null;
  created_at: string;
};

type Translation = {
  language_code: string;
  human_verified: boolean;
  title?: string;
  summary_simple?: string;
  summary_medium?: string;
  summary_complex?: string;
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

  // Translation/Summary State
  const [availableLanguages, setAvailableLanguages] = useState<string[]>(['en']);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [translations, setTranslations] = useState<Record<string, Translation>>({});

  // Edit state (Review)
  const [pros, setPros] = useState<string[]>([]);
  const [cons, setCons] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  // Edit state (Summaries)
  const [editTitle, setEditTitle] = useState("");
  const [editSimple, setEditSimple] = useState("");
  const [editMedium, setEditMedium] = useState("");
  const [editComplex, setEditComplex] = useState("");
  const [isVerified, setIsVerified] = useState(false);

  const [saving, setSaving] = useState(false);

  // Logs state
  const [billLogs, setBillLogs] = useState<any[]>([]);

  // Check if user is admin
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
        .select("id, bill_number, title, summary_simple, summary_medium, summary_complex, original_text, panel_review, created_at")
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
      .select("*")
      .eq("bill_id", billId);

    if (!error && data) {
      const transMap: Record<string, Translation> = {};
      const langs = ['en'];
      data.forEach((t: any) => {
        transMap[t.language_code] = t;
        if (!langs.includes(t.language_code)) langs.push(t.language_code);
      });
      setTranslations(transMap);
      setAvailableLanguages(langs);
    } else {
      setAvailableLanguages(['en']);
      setTranslations({});
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

    // Reset language to EN initially
    setSelectedLanguage('en');
    setEditTitle(bill.title || "");
    setEditSimple(bill.summary_simple || "");
    setEditMedium(bill.summary_medium || "");
    setEditComplex(bill.summary_complex || "");
    setIsVerified(bill.panel_review ? true : false); // 'en' verification is tied to bill verification? Or just assume verified.
    // Actually bills table has is_verified, but let's stick to translations logic for now.

    await fetchTranslations(bill.id);
    await loadBillLogs(bill.id);
  };

  // Handle language switch
  useEffect(() => {
    if (!selectedBill) return;

    if (selectedLanguage === 'en') {
      setEditTitle(selectedBill.title || "");
      setEditSimple(selectedBill.summary_simple || "");
      setEditMedium(selectedBill.summary_medium || "");
      setEditComplex(selectedBill.summary_complex || "");
      setIsVerified(true); // English is source
    } else {
      const t = translations[selectedLanguage];
      if (t) {
        setEditTitle(t.title || "");
        setEditSimple(t.summary_simple || "");
        setEditMedium(t.summary_medium || "");
        setEditComplex(t.summary_complex || "");
        setIsVerified(t.human_verified);
      } else {
        // Should not happen if availableLanguages is correct, but fallback
        setEditTitle("");
        setEditSimple("");
        setEditMedium("");
        setEditComplex("");
        setIsVerified(false);
      }
    }
  }, [selectedLanguage, translations, selectedBill]);

  const handleSave = async () => {
    if (!selectedBill || !session?.user) return;
    setSaving(true);
    try {
      // 1. Save Panel Review (Pros/Cons/Notes) - Always saves to bill
      const updatedReview = {
        ...selectedBill.panel_review,
        pros,
        cons,
        notes,
      };

      const { error: rpcError } = await supabase.rpc('update_bill_review', {
        p_bill_id: selectedBill.id,
        p_review: updatedReview
      });

      if (rpcError) throw rpcError;

      // 2. Save Summaries based on selected language
      if (selectedLanguage === 'en') {
        // Use RPC for secure update (Deep Debug Version)
        const { data: updatedData, error: billError } = await supabase.rpc('update_bill_summary', {
          p_bill_id: selectedBill.id,
          p_title: editTitle,
          p_simple: editSimple,
          p_medium: editMedium,
          p_complex: editComplex
        });

        if (billError) throw billError;

        console.log("RPC Returned Data:", updatedData);

        // Update local state with the data returned from DB
        const updatedBill = {
          ...selectedBill,
          title: updatedData.title,
          summary_simple: updatedData.summary_simple,
          summary_medium: updatedData.summary_medium,
          summary_complex: updatedData.summary_complex,
          panel_review: updatedReview
        };
        setSelectedBill(updatedBill);
        setBills(prev => prev.map(b => b.id === selectedBill.id ? updatedBill : b));

        // Log English Summary Update
        await logAdminAction(
          session.user.id,
          'update_bill_summary_en',
          selectedBill.id,
          {
            title: editTitle,
            simple: editSimple,
            medium: editMedium,
            complex: editComplex,
            db_verified: true
          }
        );

      } else {
        // Use RPC for secure translation update
        const { error: transError } = await supabase.rpc('update_bill_translation_secure', {
          p_bill_id: selectedBill.id,
          p_language_code: selectedLanguage,
          p_title: editTitle,
          p_simple: editSimple,
          p_medium: editMedium,
          p_complex: editComplex,
          p_verified: isVerified
        });

        if (transError) throw transError;

        // Update local translations map
        setTranslations(prev => ({
          ...prev,
          [selectedLanguage]: {
            ...prev[selectedLanguage],
            title: editTitle,
            summary_simple: editSimple,
            summary_medium: editMedium,
            summary_complex: editComplex,
            human_verified: isVerified
          }
        }));

        // Log Translation Update
        await logAdminAction(
          session.user.id,
          'update_bill_translation',
          selectedBill.id,
          {
            language: selectedLanguage,
            title: editTitle,
            simple: editSimple,
            medium: editMedium,
            complex: editComplex,
            verified: isVerified
          }
        );
      }

      Toast.show({ type: "success", text1: "Saved successfully" });
      await loadBillLogs(selectedBill.id);

    } catch (err: any) {
      console.error("Save error:", err);
      Toast.show({ type: "error", text1: "Save failed", text2: err.message });
    } finally {
      setSaving(false);
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
        <View style={[styles.header, { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant }]}>
          <View style={styles.headerTopRow}>
            <Text variant="titleLarge" style={{ fontWeight: '600' }}>Admin View: Bills</Text>
            <View style={{ flexDirection: 'row' }}>
              <IconButton icon="account-group" onPress={() => router.push('/admin/users')} mode="contained-tonal" size={24} style={{ marginRight: 8 }} />
              <IconButton icon="account-cog" onPress={() => router.push('/admin/account')} mode="contained-tonal" size={24} />
            </View>
          </View>
          <Searchbar
            placeholder="Search Bill Number (e.g. AB 123)"
            onChangeText={setSearchQuery}
            value={searchQuery}
            onSubmitEditing={searchBills}
            onIconPress={searchBills}
            loading={loading}
            style={[styles.searchbar, { backgroundColor: colors.surfaceContainerLowest, borderColor: colors.outlineVariant }]}
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
      <View style={[styles.header, { backgroundColor: colors.surfaceContainerHigh, borderColor: colors.outlineVariant, marginBottom: 0 }]}>
        <View style={styles.headerTopRow}>
          <Button icon="arrow-left" onPress={() => setSelectedBill(null)}>Back</Button>
          <Text variant="titleMedium" style={{ fontWeight: '600' }}>{selectedBill.bill_number}</Text>
          <Button mode="contained" onPress={handleSave} loading={saving}>Save</Button>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Survivor Panel Notes Section */}
        <View style={styles.section}>
          <Text variant="titleMedium" style={{ marginBottom: 12 }}>Survivor Panel Review</Text>
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
              <TextInput mode="outlined" value={pro} onChangeText={(text) => updatePro(text, index)} style={{ flex: 1, backgroundColor: theme.colors.surface }} dense />
              <IconButton icon="delete" onPress={() => removePro(index)} />
            </View>
          ))}
          <Button onPress={addPro} icon="plus">Add Pro</Button>

          <Text variant="titleSmall" style={{ marginTop: 16 }}>Cons</Text>
          {cons.map((con, index) => (
            <View key={index} style={styles.row}>
              <TextInput mode="outlined" value={con} onChangeText={(text) => updateCon(text, index)} style={{ flex: 1, backgroundColor: theme.colors.surface }} dense />
              <IconButton icon="delete" onPress={() => removeCon(index)} />
            </View>
          ))}
          <Button onPress={addCon} icon="plus">Add Con</Button>
        </View>

        <Divider style={{ marginVertical: 20 }} />

        {/* Bill Summaries Section */}
        <View style={styles.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text variant="titleMedium">Bill Summaries</Text>
            {selectedLanguage !== 'en' && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ marginRight: 8 }}>Verified</Text>
                <Switch value={isVerified} onValueChange={setIsVerified} />
              </View>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <SegmentedButtons
              value={selectedLanguage}
              onValueChange={setSelectedLanguage}
              buttons={availableLanguages.map(lang => ({
                value: lang,
                label: lang.toUpperCase(),
              }))}
              style={{ minWidth: 200 }}
            />
          </ScrollView>

          <TextInput
            mode="outlined"
            label="Title"
            value={editTitle}
            onChangeText={setEditTitle}
            style={{ marginBottom: 12, backgroundColor: theme.colors.surface }}
          />
          <TextInput
            mode="outlined"
            label="Simple Summary"
            value={editSimple}
            onChangeText={setEditSimple}
            multiline
            numberOfLines={4}
            style={{ marginBottom: 12, backgroundColor: theme.colors.surface }}
          />
          <TextInput
            mode="outlined"
            label="Medium Summary"
            value={editMedium}
            onChangeText={setEditMedium}
            multiline
            numberOfLines={6}
            style={{ marginBottom: 12, backgroundColor: theme.colors.surface }}
          />
          <TextInput
            mode="outlined"
            label="Complex Summary"
            value={editComplex}
            onChangeText={setEditComplex}
            multiline
            numberOfLines={8}
            style={{ marginBottom: 12, backgroundColor: theme.colors.surface }}
          />
        </View>

        <Divider style={{ marginVertical: 20 }} />

        {/* Audit Logs Section */}
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
  section: { padding: 16 },
  row: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
});
