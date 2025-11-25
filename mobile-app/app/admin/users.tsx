import React, { useState, useEffect } from "react";
import { View, StyleSheet, FlatList, Alert, Platform } from "react-native";
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
            // Fetch users via Edge Function
            const { data, error } = await supabase.functions.invoke("manage-admin-users", {
                body: { action: "list" },
            });

            if (error) throw error;

            setAdmins(data.admins);
        } catch (err: any) {
            console.error("Load admins error:", err);
            if (err.message?.includes("Failed to send a request")) {
                Toast.show({
                    type: "error",
                    text1: "Edge Function Missing",
                    text2: "Please deploy 'manage-admin-users' function."
                });
            } else {
                Toast.show({ type: "error", text1: "Failed to load admins", text2: err.message });
            }
        } finally {
            setLoading(false);
        }
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
        if (Platform.OS === 'web') {
            const confirmed = window.confirm("Are you sure you want to remove this admin? This will delete their account.");
            if (confirmed) {
                await removeAdmin(userId);
            }
        } else {
            Alert.alert(
                "Remove Admin",
                "Are you sure you want to remove this admin? This will delete their account.",
                [
                    { text: "Cancel", style: "cancel" },
                    {
                        text: "Remove",
                        style: "destructive",
                        onPress: () => removeAdmin(userId),
                    },
                ]
            );
        }
    };

    const removeAdmin = async (userId: string) => {
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
