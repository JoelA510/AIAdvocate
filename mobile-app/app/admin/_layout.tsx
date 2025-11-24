import { Stack } from 'expo-router';

export default function AdminLayout() {
    return (
        <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="login" />
            <Stack.Screen name="bills" />
            <Stack.Screen name="account" />
        </Stack>
    );
}
