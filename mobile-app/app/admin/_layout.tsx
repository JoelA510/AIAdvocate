import { useEffect, useState } from 'react';
import { useRouter, Stack } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useAuth } from '../../src/providers/AuthProvider';
import { supabase } from '../../src/lib/supabase';

export default function AdminLayout() {
    const router = useRouter();
    const { session } = useAuth();
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        const checkAdmin = async () => {
            // Not authenticated at all
            if (!session?.user) {
                router.replace('/');
                return;
            }

            try {
                // Check if user is in app_admins table
                const { data, error } = await supabase
                    .from('app_admins')
                    .select('user_id')
                    .eq('user_id', session.user.id)
                    .single();

                if (error || !data) {
                    // Not an admin - redirect to home
                    console.warn('Admin access denied for user:', session.user.email);
                    router.replace('/');
                    return;
                }

                // User is a verified admin
                setIsAdmin(true);
            } catch (err) {
                console.error('Error checking admin status:', err);
                router.replace('/');
            } finally {
                setChecking(false);
            }
        };

        checkAdmin();
    }, [session, router]);

    // Show loading while checking
    if (checking || isAdmin === null) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" />
                <Text style={styles.loadingText}>Verifying admin access...</Text>
            </View>
        );
    }

    // If we get here, user is verified admin - show the nested screens
    return (
        <Stack>
            <Stack.Screen
                name="bills"
                options={{
                    title: 'Admin: Bills',
                    headerShown: true
                }}
            />
        </Stack>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 16,
    },
    loadingText: {
        fontSize: 16,
        opacity: 0.7,
    },
});
