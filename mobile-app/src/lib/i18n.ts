import "intl-pluralrules"; // <-- KEEP THIS LINE AT THE TOP
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Importing translation files
import en from "../locales/en.json";

//Creating object with the variables of imported translation files
const resources = {
  en: {
    translation: en,
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "en", // default language
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // react already safes from xss
  },
});

export default i18n;
