import React, { useState, useEffect } from "react";
import { View, StyleSheet, FlatList, Alert } from "react-native";
import {
    Text,
    Button,
    Card,
    useTheme,
    ActivityIndicator,
    IconButton,
    Portal,
    Modal,
    TextInput,
    Avatar,
} from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "../../src/lib/supabase";
import { useAuth } from "../../src/providers/AuthProvider";
import Toast from "react-native-toast-message";
import { ThemedView } from "../../components/ThemedView";

type AdminUser = {
    id: string;
    email: string;
    created_at: string;
    is_admin: boolean;
};

export default function AdminUsersScreen() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { session } = useAuth();
    const colors = theme.colors as unknown as Record<string, string>;

    const [admins, setAdmins] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        loadAdmins();
    }, []);

    const loadAdmins = async () => {
        setLoading(true);
        try {
            // Fetch users who are in app_admins
            // Note: We can't directly join auth.users from client, so we rely on a secure view or function if available.
            // For now, we'll fetch from a secure view or assume we have a way to list them.
            // Since we don't have a direct "list users" API for client, we'll use the Edge Function to list or just list app_admins and cross-ref if possible.
            // Actually, for security, we should probably add a 'list' action to our Edge Function or a secure RPC.
            // Given the constraints, let's try to query the `app_admins` table and then maybe we can't get emails easily without a secure view.
            // Wait, we have `admin_audit_log` which might help, but really we need a secure way to list admins.
            // Let's assume for this iteration we can't easily list ALL emails without a new backend feature.
            // BUT, the user asked for this. Let's add a 'list' action to the Edge Function!
            // For now, I'll implement the UI and the 'add'/'remove' logic.
            // Listing might require a separate "get_admins" RPC or Edge Function call.
            // Let's try to fetch from `app_admins` and see if we can get emails.
            // If `app_admins` only has IDs, we can't show emails.
            // I will add a 'list' action to the Edge Function in the next step if needed, but for now let's try to use the `manage-admin-users` function for listing too?
            // The previous step didn't include 'list'. I should update it.
            // For now, I'll put a placeholder list or try to fetch what I can.
        };

        const handleCreateAdmin = async () => {
            if (!newEmail || !newPassword) {
                Toast.show({ type: "error", text1: "Email and password required" });
                return;
            }
            setCreating(true);
            try {
                const { data, error } = await supabase.functions.invoke("manage-admin-users", {
                    body: { action: "create", email: newEmail, password: newPassword },
                });

                if (error) throw error;

                Toast.show({ type: "success", text1: "Admin created successfully" });
                setModalVisible(false);
                setNewEmail("");
                setNewPassword("");
                loadAdmins(); // Reload list
            } catch (err: any) {
                Toast.show({ type: "error", text1: "Failed to create admin", text2: err.message });
            } finally {
                setCreating(false);
            }
        };

        const handleRemoveAdmin = async (userId: string) => {
            Alert.alert(
                "Remove Admin",
                "Are you sure you want to remove this admin? This will delete their account.",
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Remove",
                        style: "destructive",
                        onPress: async () => {
                            try {
                                const { error } = await supabase.functions.invoke("manage-admin-users", {
                                    body: { action: "delete", userId },
                                });
                                if (error) throw error;
                                Toast.show({ type: "success", text1: "Admin removed" });
                                loadAdmins();
                            } catch (err: any) {
                                Toast.show({ type: "error", text1: "Failed to remove admin", text2: err.message });
                            }
                        },
                    },
                ]
            );
        };

        return (
            <ThemedView style={[styles.container, { paddingTop: insets.top + 8 }]}>
                <View style={[styles.header, { borderColor: colors.outlineVariant, backgroundColor: colors.surfaceContainerHigh }]}>
                    <View style={styles.headerTopRow}>
                        <Button icon="arrow-left" onPress={() => router.back()}>Back</Button>
                        <Text variant="titleLarge" style={{ fontWeight: '600' }}>Manage Admins</Text>
                        <View style={{ width: 48 }} />
                    </View>
                </View>

                <View style={[styles.content, { paddingBottom: insets.bottom + 12 }]}>
                    {loading ? (
                        <ActivityIndicator style={{ marginTop: 20 }} size="large" />
                    ) : (
                        <FlatList
                            data={admins}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item }) => (
                                <Card style={styles.card}>
                                    <Card.Title
                                        title={item.email}
                                        subtitle={`ID: ${item.id.substring(0, 8)}...`}
                                        left={(props) => <Avatar.Icon {...props} icon="account-shield" />}
                                        right={(props) => (
                                            <IconButton {...props} icon="delete" onPress={() => handleRemoveAdmin(item.id)} />
                                        )}
                                    />
                                </Card>
                            )}
                            ListHeaderComponent={
                                <Button mode="contained" onPress={() => setModalVisible(true)} icon="plus" style={{ marginBottom: 16 }}>
                                    Add New Admin
                                </Button>
                            }
                        />
                    )}
                </View>

                <Portal>
                    <Modal visible={modalVisible} onDismiss={() => setModalVisible(false)} contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}>
                        <Text variant="headlineSmall" style={{ marginBottom: 16 }}>Add New Admin</Text>
                        <TextInput
                            label="Email"
                            value={newEmail}
                            onChangeText={setNewEmail}
                            autoCapitalize="none"
                            keyboardType="email-address"
                            style={{ marginBottom: 12 }}
                        />
                        <TextInput
                            label="Password"
                            value={newPassword}
                            onChangeText={setNewPassword}
                            secureTextEntry
                            style={{ marginBottom: 24 }}
                        />
                        <Button mode="contained" onPress={handleCreateAdmin} loading={creating} disabled={creating}>
                            Create Admin
                        </Button>
                    </Modal>
                </Portal>
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
        content: { flex: 1, paddingHorizontal: 16 },
        card: { marginBottom: 12 },
        modal: { padding: 20, margin: 20, borderRadius: 8 },
    });
