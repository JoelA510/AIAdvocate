import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useColorScheme } from "react-native";
import { PaperProvider } from "react-native-paper";

import { DarkTheme, LightTheme } from "../../constants/paper-theme";

type Mode = "system" | "light" | "dark";

type ThemeContextValue = {
  mode: Mode;
  setMode: (mode: Mode) => void;
  resolvedScheme: "light" | "dark";
};

const STORAGE_KEY = "themeMode";

const ThemeCtx = createContext<ThemeContextValue>({
  mode: "system",
  setMode: () => {},
  resolvedScheme: "light",
});

export function useAppTheme(): ThemeContextValue {
  return useContext(ThemeCtx);
}

export default function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<Mode>("system");

  useEffect(() => {
    let isMounted = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!isMounted || !stored) return;
        if (stored === "light" || stored === "dark" || stored === "system") {
          setMode(stored);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
  }, [mode]);

  const resolvedScheme = useMemo<"light" | "dark">(() => {
    if (mode === "system") {
      return systemScheme === "dark" ? "dark" : "light";
    }
    return mode;
  }, [mode, systemScheme]);

  const theme = useMemo(
    () => (resolvedScheme === "dark" ? DarkTheme : LightTheme),
    [resolvedScheme],
  );

  const value = useMemo(
    () => ({
      mode,
      setMode,
      resolvedScheme,
    }),
    [mode, resolvedScheme],
  );

  return (
    <ThemeCtx.Provider value={value}>
      <PaperProvider theme={theme}>{children}</PaperProvider>
    </ThemeCtx.Provider>
  );
}
