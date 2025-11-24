import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import {
    Text,
    TextInput,
    Button,
    Card,
    useTheme,
    List,
    Switch,
    ActivityIndicator,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/providers/AuthProvider';
import Toast from 'react-native-toast-message';
import QRCode from 'react-native-qrcode-svg';

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

    // MFA state
    const [mfaEnabled, setMfaEnabled] = useState(false);
    const [enrolling, setEnrolling] = useState(false);
    const [qrCodeUri, setQrCodeUri] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [factorId, setFactorId] = useState('');
    const [loading, setLoading] = useState(true);

    // Check admin status and MFA status on mount
    useEffect(() => {
        checkAdminAndMFA();
    }, [session]);

    const checkAdminAndMFA = async () => {
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

        // Check MFA status
        const { data, error } = await supabase.auth.mfa.listFactors();
        if (!error && data?.all) {
            const totpFactor = data.all.find((f: any) => f.factor_type === 'totp' && f.status === 'verified');
            setMfaEnabled(!!totpFactor);
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

    const handleEnrollMFA = async () => {
        setEnrolling(true);
        try {
            const { data, error } = await supabase.auth.mfa.enroll({
                factorType: 'totp',
                issuer: 'AIAdvocate',
                friendlyName: session!.user.email,
            });

            if (error) throw error;

            // The QR code URI is in data.totp.qr_code
            setQrCodeUri(data.totp.uri);
            setFactorId(data.id);

            Toast.show({
                type: 'info',
                text1: 'Scan QR Code',
                text2: 'Use an authenticator app to scan this code',
            });
        } catch (err: any) {
            Toast.show({
                type: 'error',
                text1: 'MFA enrollment failed',
                text2: err.message,
            });
            setEnrolling(false);
        }
    };

    const handleVerifyMFA = async () => {
        if (!verificationCode || verificationCode.length !== 6) {
            Toast.show({
                type: 'error',
                text1: 'Invalid code',
                text2: 'Please enter the 6-digit code from your authenticator app',
            });
            return;
        }

        try {
            const challenge = await supabase.auth.mfa.challenge({ factorId });
            if (challenge.error) throw challenge.error;

            const verify = await supabase.auth.mfa.verify({
                factorId,
                challengeId: challenge.data.id,
                code: verificationCode,
            });

            if (verify.error) throw verify.error;

            Toast.show({
                type: 'success',
                text1: 'MFA enabled',
                text2: 'Two-factor authentication is now active',
            });

            setMfaEnabled(true);
            setEnrolling(false);
            setQrCodeUri('');
            setVerificationCode('');
            setFactorId('');
        } catch (err: any) {
            Toast.show({
                type: 'error',
                text1: 'Verification failed',
                text2: 'Invalid code. Please try again.',
            });
        }
    };

    const handleDisableMFA = () => {
        Alert.alert(
            'Disable MFA',
            'Are you sure you want to disable two-factor authentication? This will make your account less secure.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Disable',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const { data, error: listError } = await supabase.auth.mfa.listFactors();

                            if (listError) throw listError;

                            const totpFactor = data?.all?.find((f: any) => f.factor_type === 'totp' && f.status === 'verified');

                            if (totpFactor) {
                                const { error } = await supabase.auth.mfa.unenroll({
                                    factorId: totpFactor.id,
                                });

                                if (error) throw error;

                                Toast.show({
                                    type: 'success',
                                    text1: 'MFA disabled',
                                    text2: 'Two-factor authentication has been disabled',
                                });

                                setMfaEnabled(false);
                            }
                        } catch (err: any) {
                            Toast.show({
                                type: 'error',
                                text1: 'Failed to disable MFA',
                                text2: err.message,
                            });
                        }
                    },
                },
            ]
        );
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

            {/* MFA Settings */}
            <Card style={styles.card}>
                <Card.Title title="Two-Factor Authentication (MFA)" subtitle="Add an extra layer of security" />
                <Card.Content style={styles.section}>
                    {!enrolling && !qrCodeUri && (
                        <>
                            <List.Item
                                title={mfaEnabled ? 'MFA Enabled' : 'MFA Disabled'}
                                description={mfaEnabled ? 'Your account is protected with 2FA' : 'Enable MFA for better security'}
                                left={(props) => <List.Icon {...props} icon={mfaEnabled ? 'shield-check' : 'shield-off'} />}
                                right={() => (
                                    <Switch
                                        value={mfaEnabled}
                                        onValueChange={(enabled) => {
                                            if (enabled) {
                                                handleEnrollMFA();
                                            } else {
                                                handleDisableMFA();
                                            }
                                        }}
                                    />
                                )}
                            />
                            {!mfaEnabled && (
                                <Text variant="bodySmall" style={{ opacity: 0.7, marginTop: 8 }}>
                                    MFA requires an authenticator app like Google Authenticator, Authy, or 1Password.
                                </Text>
                            )}
                        </>
                    )}

                    {enrolling && qrCodeUri && (
                        <View style={styles.mfaEnrollment}>
                            <Text variant="titleMedium" style={{ marginBottom: 16 }}>
                                Scan QR Code
                            </Text>
                            <View style={styles.qrCodeContainer}>
                                <QRCode value={qrCodeUri} size={200} backgroundColor="white" />
                            </View>
                            <Text variant="bodySmall" style={{ textAlign: 'center', marginTop: 16, marginBottom: 16 }}>
                                Scan this code with your authenticator app, then enter the 6-digit code below.
                            </Text>
                            <TextInput
                                mode="outlined"
                                label="Verification Code"
                                value={verificationCode}
                                onChangeText={setVerificationCode}
                                keyboardType="number-pad"
                                maxLength={6}
                                style={styles.input}
                            />
                            <View style={styles.buttonRow}>
                                <Button
                                    mode="outlined"
                                    onPress={() => {
                                        setEnrolling(false);
                                        setQrCodeUri('');
                                        setVerificationCode('');
                                        setFactorId('');
                                    }}
                                    style={{ flex: 1, marginRight: 8 }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    mode="contained"
                                    onPress={handleVerifyMFA}
                                    disabled={verificationCode.length !== 6}
                                    style={{ flex: 1, marginLeft: 8 }}
                                >
                                    Verify
                                </Button>
                            </View>
                        </View>
                    )}
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
    mfaEnrollment: {
        alignItems: 'center',
        padding: 16,
    },
    qrCodeContainer: {
        padding: 16,
        backgroundColor: 'white',
        borderRadius: 8,
    },
    buttonRow: {
        flexDirection: 'row',
        marginTop: 16,
        width: '100%',
    },
});
