// mobile-app/src/lib/i18n.ts
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Static resources bundled with the app
import en from "../locales/en.json";
import es from "../locales/es.json";

// Optional: quick pseudo-locale helper to spot missing strings
const pseudo = (s: string) =>
  s
    .replace(/[aA]/g, "á")
    .replace(/[eE]/g, "ē")
    .replace(/[iI]/g, "ï")
    .replace(/[oO]/g, "ö")
    .replace(/[uU]/g, "û");

// Enable pseudo only in dev (and only if you want to)
const DEV_PSEUDO = __DEV__ && process.env.EXPO_PUBLIC_SHOW_PSEUDO === "1";

// Languages you actually support
const SUPPORTED = DEV_PSEUDO ? ["en", "es", "qps"] : ["en", "es"];

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      ...(DEV_PSEUDO ? { qps: { translation: {} as any } } : {}),
    },
    // Initial language; your LanguageProvider will update this to the system language
    lng: "en",
    fallbackLng: "en",

    // Tell i18next exactly which language codes are valid
    supportedLngs: SUPPORTED,
    // Treat en-US/en-GB as "en" and es-MX/es-ES as "es"
    nonExplicitSupportedLngs: true,
    load: "languageOnly",

    ns: ["translation"],
    defaultNS: "translation",
    interpolation: { escapeValue: false },
    returnEmptyString: false,
    debug: __DEV__,
    saveMissing: __DEV__,
    missingKeyHandler: (_lng, _ns, key) => {
      if (__DEV__) console.warn(`[i18n] missing key: ${key}`);
    },
    // Faster startup on RN
    initImmediate: false,
  });

  // Live pseudo-locale for spotting misses: generates accented placeholders
  i18n.on("missingKey", (_lng, _ns, key) => {
    if (i18n.language === "qps") {
      // @ts-ignore
      i18n.addResource("qps", "translation", key, pseudo(key));
    }
  });
}

export default i18n;
