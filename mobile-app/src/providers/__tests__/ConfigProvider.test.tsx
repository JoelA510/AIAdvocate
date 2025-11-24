// mobile-app/src/providers/__tests__/ConfigProvider.test.tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { ConfigProvider, useConfig } from '../ConfigProvider';
import { supabase } from '../../lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initConfig } from '../../lib/config';

jest.mock('../../lib/supabase');
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
    initConfig: jest.fn(() => ({ lnfUrl: 'https://example.com', supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-key' })),
    getConfig: jest.fn(() => ({ lnfUrl: 'https://example.com', supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-key' })),
    setConfig: jest.fn(),
}));

const TestComponent = () => {
    const config = useConfig();
    return <Text testID="config">{config?.lnfUrl ?? 'none'}</Text>;
};

import { Text } from 'react-native';

describe('ConfigProvider', () => {
    const mockConfig = { lnfUrl: 'https://api.example.com' };

    beforeEach(() => {
        jest.clearAllMocks();
        (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
        (supabase.from as jest.Mock).mockReturnValue({
            select: jest.fn().mockResolvedValue({ data: [{ key: 'lnfUrl', value: mockConfig.lnfUrl }], error: null }),
        });
    });

    it('fetches remote config and provides it via context', async () => {
        const { getByTestId } = render(
            <ConfigProvider>
                <TestComponent />
            </ConfigProvider>
        );
        await waitFor(() => expect(getByTestId('config').children[0]).toBe(mockConfig.lnfUrl));
        expect(AsyncStorage.setItem).toHaveBeenCalledWith('app_config', JSON.stringify({ lnfUrl: mockConfig.lnfUrl, supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-key' }));
    });
});
