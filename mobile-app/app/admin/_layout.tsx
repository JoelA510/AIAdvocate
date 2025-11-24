import { useEffect, useState } from 'react';
import { useRouter, Stack, usePathname } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { ActivityIndicator, Text } from 'react-native-paper';
import { useAuth } from '../../src/providers/AuthProvider';
import { supabase } from '../../src/lib/supabase';

export default function AdminLayout() {
    const router = useRouter();
    const pathname = usePathname();
    const { session } = useAuth();
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
    const [checking, setChecking] = useState(false);

    // Only check admin status if NOT on login page
    useEffect(() => {
        // Allow login page to render without checks
        if (pathname === '/admin/login') {
            return;
        }

        const checkAdmin = async () => {
            setChecking(true);

            // Not authenticated or using anonymous auth - show login
            if (!session?.user || !session.user.email) {
                router.replace('/admin/login');
                setChecking(false);
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
                    // Not an admin - redirect to login
                    console.warn('Admin access denied for user:', session.user.email);
                    router.replace('/admin/login');
                    return;
                }

                // User is a verified admin
                setIsAdmin(true);
            } catch (err) {
                console.error('Error checking admin status:', err);
                router.replace('/admin/login');
            } finally {
                setChecking(false);
            }
        };

        checkAdmin();
    }, [session, pathname, router]);

    // Show loading only when checking (not on login page)
    if (checking && pathname !== '/admin/login') {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" />
                <Text style={styles.loadingText}>Verifying admin access...</Text>
            </View>
        );
    }

    // Render the stack with both screens
    return (
        <Stack>
            <Stack.Screen
                name="login"
                options={{
                    title: 'Admin Login',
                    headerShown: true
                }}
            />
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
