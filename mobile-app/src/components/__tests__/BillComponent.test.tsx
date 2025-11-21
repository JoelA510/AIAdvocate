import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BillComponent, { Bill } from '../Bill';
import { Provider as PaperProvider } from 'react-native-paper';

// Mock navigation
const mockRouter = {
    push: jest.fn(),
};
jest.mock('expo-router', () => ({
    useRouter: () => mockRouter,
    Link: ({ children }: { children: any }) => children,
}));

// Mock Toast
jest.mock('react-native-toast-message', () => ({
    show: jest.fn(),
    hide: jest.fn(),
}));

// Mock translation
jest.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string, options: any) => {
            if (typeof options === 'string') return options;
            if (typeof options === 'object' && options?.defaultValue) {
                let text = options.defaultValue;
                // Simple interpolation
                if (options.date) text = text.replace('{{date}}', options.date);
                if (options.status) text = text.replace('{{status}}', options.status);
                return text;
            }
            return key;
        },
        i18n: { language: 'en' },
    }),
}));

// Mock Auth
jest.mock('../../providers/AuthProvider', () => ({
    useAuth: () => ({
        session: { user: { id: 'test-user-id' } },
    }),
}));

// Mock Supabase
jest.mock('../../lib/supabase', () => ({
    supabase: {
        from: () => ({
            select: () => ({
                eq: () => ({
                    single: () => Promise.resolve({ data: null, error: null }),
                }),
            }),
        }),
        rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    },
}));

const mockBill: Bill = {
    id: 1,
    bill_number: 'HB 123',
    title: 'Test Bill',
    description: 'A test bill description',
    status: 'introduced',
    state_link: 'http://example.com',
    summary_simple: 'Simple summary',
    summary_medium: 'Medium summary',
    summary_complex: 'Complex summary',
    is_curated: false,
    original_text: 'Original text',
    change_hash: 'hash',
    created_at: '2023-01-01',
    panel_review: null,
};

describe('BillComponent', () => {
    it('renders bill title and number', () => {
        const { getByText } = render(
            <PaperProvider>
                <BillComponent bill={mockBill} />
            </PaperProvider>
        );

        expect(getByText('HB 123')).toBeTruthy();
        expect(getByText('Test Bill')).toBeTruthy();
    });

    it('navigates to details on press', () => {
        const { getByText } = render(
            <PaperProvider>
                <BillComponent bill={mockBill} />
            </PaperProvider>
        );

        fireEvent.press(getByText('Test Bill'));
        expect(mockRouter.push).toHaveBeenCalledWith('/bill/1');
    });
});
