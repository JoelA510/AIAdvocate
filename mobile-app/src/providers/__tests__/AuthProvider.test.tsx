// mobile-app/src/providers/__tests__/AuthProvider.test.tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../AuthProvider';
import { supabase } from '../../lib/supabase';
import { registerForPushNotificationsAsync } from '../../lib/push';
import { captureException } from '../../lib/sentry';
import Toast from 'react-native-toast-message';

// Mock dependencies
jest.mock('../../lib/supabase');
jest.mock('../../lib/push');
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

// Helper component to expose auth context values
const TestComponent = () => {
    const { session, loading } = useAuth();
    return (
        <>
            <Text testID="loading">{loading ? 'loading' : 'ready'}</Text>
            <Text testID="session">{session ? 'authenticated' : 'no-session'}</Text>
            <Text testID="user-id">{session?.user?.id ?? 'none'}</Text>
        </>
    );
};

import { Text } from 'react-native';

describe('AuthProvider', () => {
    const mockSession = { user: { id: 'test-user-123' }, access_token: 'token' } as any;

    beforeEach(() => {
        jest.clearAllMocks();
        // Default mock implementations
        (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: mockSession }, error: null });
        (supabase.auth.signInAnonymously as jest.Mock).mockResolvedValue({ data: { session: mockSession }, error: null });
        (supabase.auth.onAuthStateChange as jest.Mock).mockImplementation(() => ({ data: { subscription: { unsubscribe: jest.fn() } } }));
        (registerForPushNotificationsAsync as jest.Mock).mockResolvedValue(undefined);
        (captureException as jest.Mock).mockImplementation(() => { });
    });

    it('initializes with existing session', async () => {
        const { getByTestId } = render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );
        // initially loading
        expect(getByTestId('loading').children[0]).toBe('loading');
        await waitFor(() => expect(getByTestId('loading').children[0]).toBe('ready'));
        expect(getByTestId('session').children[0]).toBe('authenticated');
        expect(getByTestId('user-id').children[0]).toBe('test-user-123');
        // push registration should be called
        await waitFor(() => expect(registerForPushNotificationsAsync).toHaveBeenCalledWith('test-user-123'));
    });

    it('handles missing session by anonymous sign‑in', async () => {
        (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null }, error: null });
        const { getByTestId } = render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );
        await waitFor(() => expect(getByTestId('loading').children[0]).toBe('ready'));
        expect(supabase.auth.signInAnonymously).toHaveBeenCalled();
    });

    it('captures errors and shows toast', async () => {
        const err = new Error('boom');
        (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null }, error: err });
        const { getByTestId } = render(
            <AuthProvider>
                <TestComponent />
            </AuthProvider>
        );
        await waitFor(() => expect(getByTestId('loading').children[0]).toBe('ready'));
        expect(captureException).toHaveBeenCalledWith(err, { context: 'auth_initialization' });
        expect(Toast.show).toHaveBeenCalled();
    });
});
