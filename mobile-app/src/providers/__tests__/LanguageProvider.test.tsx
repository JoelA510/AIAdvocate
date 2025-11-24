// mobile-app/src/providers/__tests__/LanguageProvider.test.tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { LanguageProvider, useLanguage } from '../LanguageProvider';
import i18n from '@/lib/i18n';
import * as Localization from 'expo-localization';
import { Text } from 'react-native';

jest.mock('expo-localization', () => ({
    getLocales: jest.fn(() => [{ languageTag: 'en-US' }]),
    locale: 'en-US',
}));

jest.mock('@/lib/i18n', () => ({
    language: 'fr', // Set to 'fr' to ensure 'en' (init) and 'es' (change) both trigger updates
    changeLanguage: jest.fn().mockResolvedValue(undefined),
}));

const TestComponent = () => {
    const { lang, setLang, available } = useLanguage();
    return (
        <>
            <Text testID="lang">{lang}</Text>
            <Text testID="available">{available.join(',')}</Text>
            <Text testID="set" onPress={() => setLang('es')} />
        </>
    );
};

describe('LanguageProvider', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('initialises with detected language', async () => {
        const { getByTestId } = render(
            <LanguageProvider>
                <TestComponent />
            </LanguageProvider>
        );
        await waitFor(() => expect(getByTestId('lang').children[0]).toBe('en'));
        expect(i18n.changeLanguage).toHaveBeenCalledWith('en');
    });

    it('allows changing language and updates i18n', async () => {
        const { getByTestId } = render(
            <LanguageProvider>
                <TestComponent />
            </LanguageProvider>
        );
        await waitFor(() => expect(getByTestId('lang').children[0]).toBe('en'));
        // trigger language change
        getByTestId('set').props.onPress();
        await waitFor(() => expect(getByTestId('lang').children[0]).toBe('es'));
        expect(i18n.changeLanguage).toHaveBeenCalledWith('es');
    });
});
