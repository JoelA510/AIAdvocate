// mobile-app/src/lib/i18n.ts

import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import 'intl-pluralrules';

// Import your translation files
import en from '../locales/en.json';
import es from '../locales/es.json';

export const resources = {
  en: { translation: en },
  es: { translation: es },
  // Add other languages here
} as const;

i18next
  .use(initReactI18next)
  .init({
    compatibilityJSON: 'v3', // For React Native
    resources,
    // Detect the user's language and use the first part (e.g., "en" from "en-US")
    lng: Localization.locale.split('-')[0],
    fallbackLng: 'en', // If the detected language isn't available, fall back to English
    interpolation: {
      escapeValue: false, // React already protects from XSS
    },
  });

export default i18next;