// mobile-app/src/__tests__/integration/SavedBillsScreen.test.tsx
import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import SavedBillsScreen from '../../../app/(tabs)/saved';
import { AuthProvider } from '../../providers/AuthProvider';
import { supabase } from '../../lib/supabase';

// Mock dependencies
jest.mock('../../lib/supabase');
jest.mock('../../lib/push', () => ({
    registerForPushNotificationsAsync: jest.fn().mockResolvedValue('token'),
}));
jest.mock('../../lib/sentry');
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('@react-native-async-storage/async-storage', () => ({
    setItem: jest.fn(),
    getItem: jest.fn(),
    removeItem: jest.fn(),
    mergeItem: jest.fn(),
    clear: jest.fn(),
    getAllKeys: jest.fn(),
    flushGetRequests: jest.fn(),
    multiGet: jest.fn(),
    multiSet: jest.fn(),
    multiRemove: jest.fn(),
    multiMerge: jest.fn(),
}));
jest.mock('../../lib/config', () => ({
    initConfig: jest.fn(() => ({ supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-key' })),
    getConfig: jest.fn(() => ({ supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-key' })),
    setConfig: jest.fn(),
}));
jest.mock('expo-router', () => {
    const React = require('react');
    return {
        useFocusEffect: (cb: any) => React.useEffect(cb, [cb]),
        Stack: { Screen: () => null },
    };
});
jest.mock('react-native-safe-area-context', () => ({
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string, o: any) => o?.defaultValue || k }),
}));
jest.mock('react-native-paper', () => ({
    useTheme: () => ({
        colors: { surface: 'white', outline: 'gray' },
        fonts: {
            bodyMedium: { fontFamily: 'System' },
            titleLarge: { fontFamily: 'System' },
        }
    }),
}));
jest.mock('../../components/Bill', () => {
    const { Text, View } = require('react-native');
    return ({ bill }: any) => (
        <View>
            <Text>{bill.title}</Text>
            <Text>{bill.identifier}</Text>
        </View>
    );
});

describe('SavedBillsScreen Integration', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('shows empty state when user is not logged in', async () => {
        // Mock logged out state
        (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null }, error: null });
        (supabase.auth.onAuthStateChange as jest.Mock).mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
        (supabase.auth.signInAnonymously as jest.Mock).mockResolvedValue({ data: { session: null }, error: null });

        const { getByText } = render(
            <AuthProvider>
                <SavedBillsScreen />
            </AuthProvider>
        );

        await waitFor(() => expect(getByText('No saved bills yet')).toBeTruthy());
    });

    it('fetches and displays saved bills when user is logged in', async () => {
        // Mock logged in state
        const mockUser = { id: 'user-123', email: 'test@example.com' };
        const mockSession = { user: mockUser, access_token: 'token' };
        (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: mockSession }, error: null });
        (supabase.auth.onAuthStateChange as jest.Mock).mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });

        // Mock data fetching
        const mockBookmarks = [{ bill_id: 'bill-1', created_at: '2023-01-01' }];
        const mockBills = [{ id: 'bill-1', title: 'Test Bill', identifier: 'HB 101' }];

        (supabase.from as jest.Mock).mockImplementation((table) => {
            if (table === 'bookmarks') {
                return {
                    select: jest.fn().mockReturnThis(),
                    eq: jest.fn().mockReturnThis(),
                    order: jest.fn().mockResolvedValue({ data: mockBookmarks, error: null }),
                };
            }
            if (table === 'bills') {
                return {
                    select: jest.fn().mockReturnThis(),
                    in: jest.fn().mockResolvedValue({ data: mockBills, error: null }),
                };
            }
            return { select: jest.fn() };
        });

        // Mock RPC calls
        (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });

        // Mock channel subscription
        (supabase.channel as jest.Mock).mockReturnValue({
            on: jest.fn().mockReturnThis(),
            subscribe: jest.fn(),
        });

        const { getByText, findByText } = render(
            <AuthProvider>
                <SavedBillsScreen />
            </AuthProvider>
        );

        await findByText('Test Bill');
        expect(getByText('HB 101')).toBeTruthy();
    });
});
