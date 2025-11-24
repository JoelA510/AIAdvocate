import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import {
    Text,
    TextInput,
    Button,
    Card,
    useTheme,
    List,
    ActivityIndicator,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import Toast from 'react-native-toast-message';

export default function AdminAccountScreen() {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const router = useRouter();
    const { session } = useAuth();

    // Password change state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [changingPassword, setChangingPassword] = useState(false);
    const [loading, setLoading] = useState(true);

    // Check admin status on mount
    useEffect(() => {
        checkAdmin();
    }, [session]);

    const checkAdmin = async () => {
        if (!session?.user || !session.user.email) {
            router.replace('/admin/login');
            return;
        }

        // Check if user is admin
        const { data: adminData, error: adminError } = await supabase
            .from('app_admins')
            .select('user_id')
            .eq('user_id', session.user.id)
            .single();

        if (adminError || !adminData) {
            Alert.alert('Access Denied', 'You do not have admin permissions.');
            router.replace('/admin/login');
            return;
        }

        setLoading(false);
    };

    const handlePasswordChange = async () => {
        if (!newPassword || !confirmPassword || !currentPassword) {
            Toast.show({
                type: 'error',
                text1: 'Missing fields',
                text2: 'Please fill in all password fields',
            });
            return;
        }

        if (newPassword !== confirmPassword) {
            Toast.show({
                type: 'error',
                text1: 'Passwords do not match',
                text2: 'New password and confirmation must match',
            });
            return;
        }

        if (newPassword.length < 8) {
            Toast.show({
                type: 'error',
                text1: 'Password too short',
                text2: 'Password must be at least 8 characters',
            });
            return;
        }

        setChangingPassword(true);
        try {
            // Re-authenticate with current password first
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email: session!.user.email!,
                password: currentPassword,
            });

            if (signInError) {
                Toast.show({
                    type: 'error',
                    text1: 'Authentication failed',
                    text2: 'Current password is incorrect',
                });
                return;
            }

            // Update password
            const { error } = await supabase.auth.updateUser({
                password: newPassword,
            });

            if (error) throw error;

            Toast.show({
                type: 'success',
                text1: 'Password updated',
                text2: 'Your password has been changed successfully',
            });

            // Clear form
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err: any) {
            Toast.show({
                type: 'error',
                text1: 'Password change failed',
                text2: err.message || 'An error occurred',
            });
        } finally {
            setChangingPassword(false);
        }
    };

    if (loading) {
        return (
            <View style={[styles.container, { backgroundColor: theme.colors.background, justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    return (
        <ScrollView
            style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}
            contentContainerStyle={{ paddingBottom: 40 }}
        >
            <View style={styles.header}>
                <Button icon="arrow-left" onPress={() => router.back()}>
                    Back
                </Button>
                <Text variant="headlineMedium" style={{ flex: 1, textAlign: 'center' }}>
                    Account Settings
                </Text>
                <View style={{ width: 80 }} />
            </View>

            {/* Account Info */}
            <Card style={styles.card}>
                <Card.Title title="Account Information" />
                <Card.Content>
                    <Text variant="bodyMedium">Email: {session?.user.email}</Text>
                    <Text variant="bodySmall" style={{ opacity: 0.7, marginTop: 4 }}>
                        Account ID: {session?.user.id}
                    </Text>
                </Card.Content>
            </Card>

            {/* Change Password */}
            <Card style={styles.card}>
                <Card.Title title="Change Password" />
                <Card.Content style={styles.section}>
                    <TextInput
                        mode="outlined"
                        label="Current Password"
                        value={currentPassword}
                        onChangeText={setCurrentPassword}
                        secureTextEntry
                        autoCapitalize="none"
                        disabled={changingPassword}
                        style={styles.input}
                    />
                    <TextInput
                        mode="outlined"
                        label="New Password"
                        value={newPassword}
                        onChangeText={setNewPassword}
                        secureTextEntry
                        autoCapitalize="none"
                        disabled={changingPassword}
                        style={styles.input}
                    />
                    <TextInput
                        mode="outlined"
                        label="Confirm New Password"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry
                        autoCapitalize="none"
                        disabled={changingPassword}
                        style={styles.input}
                        onSubmitEditing={handlePasswordChange}
                    />
                    <Button
                        mode="contained"
                        onPress={handlePasswordChange}
                        loading={changingPassword}
                        disabled={changingPassword}
                        style={styles.button}
                    >
                        Change Password
                    </Button>
                </Card.Content>
            </Card>

            {/* Future MFA Section - Placeholder */}
            <Card style={styles.card}>
                <Card.Title title="Two-Factor Authentication" subtitle="Coming soon" />
                <Card.Content>
                    <List.Item
                        title="MFA Not Available"
                        description="Two-factor authentication will be enabled in a future update"
                        left={(props) => <List.Icon {...props} icon="shield-off" />}
                        disabled
                    />
                </Card.Content>
            </Card>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        justifyContent: 'space-between',
    },
    card: {
        margin: 16,
        marginTop: 0,
    },
    section: {
        gap: 12,
    },
    input: {
        marginBottom: 8,
    },
    button: {
        marginTop: 8,
    },
});
