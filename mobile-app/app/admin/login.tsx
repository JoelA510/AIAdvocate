import { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, TextInput, Button, Card } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { supabase } from '../../src/lib/supabase';
import Toast from 'react-native-toast-message';

export default function AdminLoginScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!email.trim() || !password.trim()) {
            Toast.show({
                type: 'error',
                text1: 'Missing credentials',
                text2: 'Please enter both email and password',
            });
            return;
        }

        setLoading(true);
        try {
            // Sign in with email/password
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            });

            if (error) throw error;

            if (data.user) {
                // Check if user is admin
                const { data: adminData, error: adminError } = await supabase
                    .from('app_admins')
                    .select('user_id')
                    .eq('user_id', data.user.id)
                    .single();

                if (adminError || !adminData) {
                    // Not an admin - sign out and show error
                    await supabase.auth.signOut();
                    Toast.show({
                        type: 'error',
                        text1: 'Access Denied',
                        text2: 'This account is not an admin',
                    });
                    return;
                }

                // Success - show toast
                Toast.show({
                    type: 'success',
                    text1: 'Welcome',
                    text2: `Logged in as ${email}`,
                });

                // Force session refresh to update AuthProvider
                await supabase.auth.getSession();

                // Navigate after ensuring session is refreshed
                setTimeout(() => {
                    router.push('/admin/bills');
                }, 300);
            }
        } catch (err: any) {
            Toast.show({
                type: 'error',
                text1: 'Login failed',
                text2: err.message || 'Invalid credentials',
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <View style={styles.content}>
                <Card style={styles.card}>
                    <Card.Title title="Admin Login" subtitle="Enter your credentials" />
                    <Card.Content style={styles.form}>
                        <TextInput
                            mode="outlined"
                            label="Email"
                            value={email}
                            onChangeText={setEmail}
                            keyboardType="email-address"
                            autoCapitalize="none"
                            autoComplete="email"
                            disabled={loading}
                            style={styles.input}
                        />
                        <TextInput
                            mode="outlined"
                            label="Password"
                            value={password}
                            onChangeText={setPassword}
                            secureTextEntry
                            autoCapitalize="none"
                            autoComplete="password"
                            disabled={loading}
                            style={styles.input}
                            onSubmitEditing={handleLogin}
                        />
                        <Button
                            mode="contained"
                            onPress={handleLogin}
                            loading={loading}
                            disabled={loading}
                            style={styles.button}
                        >
                            Login
                        </Button>
                        <Button
                            mode="text"
                            onPress={() => router.back()}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                    </Card.Content>
                </Card>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
    },
    content: {
        flex: 1,
        justifyContent: 'center',
        padding: 16,
    },
    card: {
        maxWidth: 400,
        width: '100%',
        alignSelf: 'center',
    },
    form: {
        gap: 16,
        paddingTop: 16,
    },
    input: {
        marginBottom: 8,
    },
    button: {
        marginTop: 8,
    },
});
