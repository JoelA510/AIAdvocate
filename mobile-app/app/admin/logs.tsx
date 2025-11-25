import React, { useState, useEffect } from "react";
import { View, StyleSheet, FlatList } from "react-native";
import {
    Text,
    Button,
    Card,
    useTheme,
    ActivityIndicator,
    Searchbar,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { useAuth } from "../../src/providers/AuthProvider";
import Toast from "react-native-toast-message";
import { ThemedView } from "../../components/ThemedView";

type AuditLog = {
    id: number;
    user_id: string;
    action: string;
    bill_id?: number;
    details?: any;
    timestamp: string;
    user_email?: string; // Joined manually or via view if possible
};

export default function AdminLogsScreen() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { session } = useAuth();
    const colors = theme.colors as unknown as Record<string, string>;

    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        loadLogs();
    }, []);

    const loadLogs = async () => {
        setLoading(true);
        try {
            // Fetch logs
            // Note: We can't easily join auth.users to get emails without a secure view.
            // For now, we'll show User IDs.
            // Ideally, we'd create a secure view `v_admin_audit_log` that joins with `auth.users`.
            // But let's stick to the requested scope: "shows all of their admin actions".
            // Wait, the user said "shows all of their admin actions that have been logged".
            // "their" could mean the current admin OR all admins.
            // "log page per admin" implies filtering by admin.
            // "as well as the logs to show at the bottom of an Admin bill view".
            // Let's fetch ALL logs for this global view.

            let query = supabase
                .from("admin_audit_log")
                .select("*")
                .order("timestamp", { ascending: false })
                .limit(50);

            if (searchQuery) {
                // Simple client-side filter or basic text search if supported
                // API doesn't support complex text search on all columns easily without setup.
                // We'll filter client side for this MVP or just search action.
                query = query.ilike("action", `%${searchQuery}%`);
            }

            const { data, error } = await query;
            if (error) throw error;
            setLogs(data || []);
        } catch (err: any) {
            Toast.show({ type: "error", text1: "Failed to load logs", text2: err.message });
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (iso: string) => {
        return new Date(iso).toLocaleString();
    };

    return (
        <ThemedView style={[styles.container, { paddingTop: insets.top + 8 }]}>
            <View style={[styles.header, { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerHigh }]}>
                <View style={styles.headerTopRow}>
                    <Button icon="arrow-left" onPress={() => router.back()}>Back</Button>
                    <Text variant="titleLarge" style={{ fontWeight: '600' }}>Audit Logs</Text>
                    <View style={{ width: 48 }} />
                </View>
                <Searchbar
                    placeholder="Search Action"
                    onChangeText={setSearchQuery}
                    value={searchQuery}
                    onSubmitEditing={loadLogs}
                    onIconPress={loadLogs}
                    style={[styles.searchbar, { backgroundColor: colors.surfaceContainerLowest }]}
                />
            </View>

            <View style={[styles.content, { paddingBottom: insets.bottom + 12 }]}>
                {loading ? (
                    <ActivityIndicator style={{ marginTop: 20 }} size="large" />
                ) : (
                    <FlatList
                        data={logs}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={({ item }) => (
                            <Card style={styles.card}>
                                <Card.Title
                                    title={item.action}
                                    subtitle={formatTime(item.timestamp)}
                                    right={(props) => <Text {...props} style={{ marginRight: 16, fontSize: 12 }}>{item.user_id.substring(0, 8)}...</Text>}
                                />
                                <Card.Content>
                                    {item.bill_id && <Text variant="bodySmall">Bill ID: {item.bill_id}</Text>}
                                    {item.details && (
                                        <Text variant="bodySmall" style={{ fontFamily: 'monospace' }}>
                                            {JSON.stringify(item.details)}
                                        </Text>
                                    )}
                                </Card.Content>
                            </Card>
                        )}
                        ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 20 }}>No logs found.</Text>}
                    />
                )}
            </View>
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
        marginBottom: 16,
    },
    headerTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    searchbar: {
        elevation: 0,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.1)',
    },
    content: { flex: 1, paddingHorizontal: 16 },
    card: { marginBottom: 12 },
});
