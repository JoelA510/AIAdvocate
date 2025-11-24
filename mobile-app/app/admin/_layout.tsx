import { Stack } from 'expo-router';

export default function AdminLayout() {
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
