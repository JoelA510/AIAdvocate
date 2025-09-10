import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import * as Localization from "expo-localization";
import i18n from "@/lib/i18n";

type LangCode = "en" | "es" | "pseudo";

type LanguageContextValue = {
  lang: LangCode;
  setLang: (code: LangCode) => void;
  available: LangCode[]; // what the UI should show
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const SUPPORTED: LangCode[] = ["en", "es"];

function detectInitial(): LangCode {
  const tag =
    (Localization.getLocales && Localization.getLocales()[0]?.languageTag) ||
    (Localization as any).locale ||
    "en";
  const base = tag.split("-")[0].toLowerCase();
  return (SUPPORTED as string[]).includes(base) ? (base as LangCode) : "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<LangCode>(detectInitial());

  useEffect(() => {
    // Map "pseudo" to "en" resources; your UI can render pseudo if you want.
    const target = lang === "pseudo" ? "en" : lang;
    if (i18n.language !== target) {
      i18n.changeLanguage(target).catch(() => {});
    }
  }, [lang]);

  const available = useMemo<LangCode[]>(
    () => (__DEV__ ? [...SUPPORTED, "pseudo"] : [...SUPPORTED]),
    [],
  );

  const value = useMemo(() => ({ lang, setLang, available }), [lang, available]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
